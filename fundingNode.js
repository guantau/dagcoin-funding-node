/*jslint node: true */
"use strict";
var conf = require('byteballcore/conf.js');
var db = require('byteballcore/db.js');
var eventBus = require('byteballcore/event_bus.js');

const AccountManager = require('./components/accountManager');
const accountManager = new AccountManager();
let fundingExchangeProvider = null;

if (conf.permanent_pairing_secret)
	db.query(
		"INSERT "+db.getIgnore()+" INTO pairing_secrets (pairing_secret, is_permanent, expiry_date) VALUES (?, 1, '2038-01-01')", 
		[conf.permanent_pairing_secret]
	);

function handlePairing(from_address){
	console.log(`PAIRED WITH ${from_address}`);
}

function setupChatEventHandlers(){
	eventBus.on('paired', function(fromAddress){
		console.log('paired '+fromAddress);
		handlePairing(fromAddress);
	});

    // One device can send such message to check whether another device can exchange messages
    eventBus.on('dagcoin.is-connected', (message, fromAddress) => {
        console.log('DAGCOIN CONNECTION REQUEST');

        const reply = {
            protocol: 'dagcoin',
            title: 'connected'
        };

        const device = require('byteballcore/device.js');

        const DiscoveryService = require('./submodules/discoveryService');
        const discoveryService = new DiscoveryService();

        discoveryService.getCorrespondent(fromAddress).then((correspondent) => {
            if(correspondent != null) {
                device.sendMessageToDevice(fromAddress, 'text', JSON.stringify(reply));
            } else {
                console.log(`CORRESPONDENT OF ${fromAddress} NOT FOUND`);
            }
        });
    });

	eventBus.on('text', function(fromAddress, text){
		console.log(`TEXT MESSAGE FROM ${fromAddress}: ${text}`);

		let message = null;

        try {
            message = JSON.parse(text);
        } catch (err) {
            console.log(`NEW MESSAGE FROM ${fromAddress}: ${text} NOT A JSON MESSAGE: ${err}`);
        }

        if (message !== null) {
            if (message.protocol === 'dagcoin') {
                console.log(`DAGCOIN MESSAGE RECEIVED FROM ${fromAddress}`);
                eventBus.emit(`dagcoin.${message.title}`, message, fromAddress);
                return Promise.resolve(true);
            }

            console.log(`JSON MESSAGE RECEIVED FROM ${fromAddress} WITH UNEXPECTED PROTOCOL: ${message.protocol}`);
        }
	});
}

function getSharedAddressBalance(sharedAddress) {
    return new Promise((resolve) => {
        db.query(
            "SELECT asset, address, is_stable, SUM(amount) AS balance \n\
            FROM outputs CROSS JOIN units USING(unit) \n\
            WHERE is_spent=0 AND sequence='good' AND address = ? \n\
            GROUP BY asset, address, is_stable \n\
            UNION ALL \n\
            SELECT NULL AS asset, address, 1 AS is_stable, SUM(amount) AS balance FROM witnessing_outputs \n\
            WHERE is_spent=0 AND address = ? GROUP BY address \n\
            UNION ALL \n\
            SELECT NULL AS asset, address, 1 AS is_stable, SUM(amount) AS balance FROM headers_commission_outputs \n\
            WHERE is_spent=0 AND address = ? GROUP BY address",
            [sharedAddress, sharedAddress, sharedAddress],
            function(rows){
                const assocBalances = {};

                assocBalances["base"] = {stable: 0, pending: 0, total: 0};

                for (var i=0; i<rows.length; i++){
                    var row = rows[i];

                    console.log(`SOMETHING FOR ${sharedAddress}: ${JSON.stringify(row)}`);

                    var asset = row.asset || "base";

                    if (!assocBalances[asset]){
                        assocBalances[asset] = {stable: 0, pending: 0, total: 0};
                        console.log(`CREATED THE BALANCES ARRAY OF ADDRESS ${sharedAddress} FOR ASSET ${asset}`);
                    }

                    console.log(`UPDATING BALANCE OF ${sharedAddress} FOR ASSET ${asset}: ${row.is_stable ? 'stable' : 'pending'} ${row.balance}`);
                    assocBalances[asset][row.is_stable ? 'stable' : 'pending'] += row.balance;
                    assocBalances[asset]['total'] += row.balance;
                }

                resolve(assocBalances);
            }
        );
    });
}

function fundSharedAddress () {
    db.query('SELECT shared_address FROM shared_addresses', [], (rows) => {
        console.log('UPDATING FUND OF SHARED ADDRESSES');
        for(let index in rows) {
            const sharedAddress = rows[index].shared_address;

            getSharedAddressBalance(sharedAddress).then((assocBalances) => {
                console.log(`BALANCE FOR ${sharedAddress}: ${JSON.stringify(assocBalances)}`);

                const baseBalance = assocBalances['base'].total || 0;

                if (baseBalance < 5000) {
                    console.log(`ADDRESS ${sharedAddress} SHOULD BE FUNDED AS IT HAS JUST ${baseBalance} BYTES`);
                    accountManager.sendPayment(sharedAddress, 5000);
                }
            });
        }

        console.log();
    });
}

setTimeout(function(){
    accountManager.readAccount().then(
        () => {
            setupChatEventHandlers();

            const FundingExchangeProvider = require('./submodules/fundingExchangeProviderService');
            fundingExchangeProvider = new FundingExchangeProvider(accountManager.getPairingCode(), accountManager.getPrivateKey());
            fundingExchangeProvider
                .activate()
                .then(() => {
                    console.log('COMPLETED ACTIVATION ... UPDATING SETTINGS');
                    return fundingExchangeProvider.updateSettings()
                }).catch(err => {
                console.log(err);
            });

            fundingExchangeProvider.handleSharedPaymentRequest();

            setInterval(fundSharedAddress, 60 * 1000);
        },
        (err) => {
            console.log(`COULD NOT START: ${err}`);
            process.exit();
        }
    );
}, 1000);