/*jslint node: true */
"use strict";
var conf = require('byteballcore/conf.js');
var db = require('byteballcore/db.js');
var eventBus = require('byteballcore/event_bus.js');

const AccountManager = require('./components/accountManager');
const accountManager = new AccountManager();
let fundingExchangeProvider = null;

const DatabaseManager = require('./components/databaseManager');
const dbManager = DatabaseManager.getInstance();

const ProofManager = require('./components/proofManager');
const proofManager = new ProofManager();

const DagcoinProtocolManager = require('./components/dagcoinProtocolManager');
const dagcoinProtocolManager = new DagcoinProtocolManager();

const fundsNeedingAddresses = new Array();

const followedAddress = {};

if (conf.permanent_pairing_secret) {
    dbManager.query (
        "INSERT " + db.getIgnore() + " INTO pairing_secrets (pairing_secret, is_permanent, expiry_date) VALUES (?, 1, '2038-01-01')",
        [conf.permanent_pairing_secret]
    );
}

function handlePairing(from_address) {
    console.log(`PAIRED WITH ${from_address}`);
}

function setupChatEventHandlers() {
    eventBus.on('paired', function (fromAddress) {
        console.log('paired ' + fromAddress);
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

        const DiscoveryService = require('./components/discoveryService');
        const discoveryService = new DiscoveryService();

        discoveryService.getCorrespondent(fromAddress).then((correspondent) => {
            if (correspondent != null) {
                device.sendMessageToDevice(fromAddress, 'text', JSON.stringify(reply));
            } else {
                console.log(`CORRESPONDENT OF ${fromAddress} NOT FOUND`);
            }
        });

        // IF THE CONNECTED DEVICE HAS A FUNDING ADDRESS, LET'S LOAD IT
        dbManager.query(
            'SELECT shared_address, master_address, master_device_address, definition_type, ' +
            'status, created, last_status_change, previous_status FROM dagcoin_funding_addresses WHERE master_device_address = ?',
            [fromAddress]
        ).then((rows) => {
            if (!rows || rows.length === 0) {
                return Promise.resolve();
            }

            if (followedAddress[rows[0].shared_address]) {
                console.log(`ALREADY FOLLOWING ${rows[0].shared_address}`)
                return Promise.resolve();
            }

            const fundingAddressFsm = require('./components/machines/fundingAddress/fundingAddress')(rows[0]);

            console.log(fundingAddressFsm.getCurrentState().getName());

            followedAddress[rows[0].shared_address] = fundingAddressFsm;

            return fundingAddressFsm.pingUntilOver(false);
        });
    });

    eventBus.on('internal.dagcoin.addresses-to-follow', (fundingAddresses) => {
        fundingAddresses.forEach((fundingAddressObject) => {
            if (followedAddress[fundingAddressObject.shared_address]) {
                console.log(`ALREADY FOLLOWING ${fundingAddressObject.shared_address}`)
            } else {
                const fundingAddressFsm = require('../machines/fundingAddress/fundingAddress')(fundingAddressObject);
                console.log(`FUNDING FSM CREATED FOR ${JSON.stringify(fundingAddressObject)}`);
                fundingAddressFsm.pingUntilOver(false).then(() => {
                    console.log(`FINISHED PINGING ${fundingAddressObject.shared_address}. CURRENT STATUS: ${fundingAddressFsm.getCurrentState().getName()}`);
                });
                followedAddress[fundingAddressObject] = fundingAddressFsm;
            }
        });
    });

    eventBus.on('dagcoin.request.link-address', (message, fromAddress) => {
        console.log(`DAGCOIN link-address REQUEST: ${JSON.stringify(message)} FROM ${fromAddress}`);

        message.messageBody.device_address = fromAddress;

        proofManager.proofAddressAndSaveToDB(message.messageBody, fromAddress);
    });

    eventBus.on('dagcoin.request.load-address', (message, fromAddress) => {
        console.log(`DAGCOIN load-address REQUEST: ${JSON.stringify(message)} FROM ${fromAddress}`);

        dbManager.query(
            'SELECT shared_address, master_address, master_device_address, definition_type, ' +
            'status, created, last_status_change, previous_status FROM dagcoin_funding_addresses WHERE master_device_address = ?',
            [fromAddress]
        ).then((rows) => {
            if (!rows || rows.length === 0) {
                console.log(`REQUESTED TO LOAD A FUNDING ADDRESS NOT IN dagcoin_funding_addresses: ${fromAddress}`);

                return dbManager.query(
                    'SELECT shared_address FROM shared_address_signing_paths WHERE device_address = ?',
                    [fromAddress]
                ).then((rows) => {
                    if (!rows || rows.length === 0) {
                        console.log(`DEVICE ADDRESS ${fromAddress} IN NEITHER IN dagcoin_funding_addresses NOR IN shared_address_signing_paths`);
                        return Promise.resolve();
                    }

                    return dagcoinProtocolManager.sendRequestAndListen(fromAddress, 'have-dagcoins', {}).then((messageBody) => {
                        const proofs = messageBody.proofs;

                        if (!proofs || proofs.length === 0) {
                            console.log(`REQUEST have-dagcoins DID NOT PROVIDE NEW ADDRESSES FOR ${fromAddress}. CHECK WHETHER THERE ARE ERRORS`);
                            return Promise.resolve();
                        }

                        console.log(`PROOFS: ${JSON.stringify(proofs)}`);

                        return proofManager.proofAddressBatch(proofs, fromAddress);
                    });
                });
            }

            if (followedAddress[rows[0].shared_address]) {
                console.log(`ALREADY FOLLOWING ${rows[0].shared_address}`);
                return Promise.resolve();
            }

            const fundingAddressFsm = require('./components/machines/fundingAddress/fundingAddress')(rows[0]);

            console.log(fundingAddressFsm.getCurrentState().getName());

            followedAddress[rows[0].shared_address] = fundingAddressFsm;

            return fundingAddressFsm.pingUntilOver(false);
        }).catch((error) => {
            console.log(`COULD NOT LOAD THE FUNDING ADDRESS OF ${fromAddress} FOR ${JSON.stringify(message)}: ${error}`);
        });
    });

    eventBus.on('text', function (fromAddress, text) {
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

dbManager.checkOrUpdateDatabase().then(() => {
    accountManager.readAccount().then(
        () => {
            try {
                setupChatEventHandlers();

                console.log('WHAT');

                const FundingExchangeProvider = require('./components/fundingExchangeProviderService');
                console.log('HANDLERS ARE UP');
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

                setInterval(() => {
                    console.log('STATUSES');
                    console.log('--------------------');
                    for (let address in followedAddress) {
                        console.log(`${address} : ${followedAddress[address].getCurrentState().getName()}`)
                    }
                    console.log('--------------------');
                }, 60 * 1000);

                // SETTING UP THE LOOPS
                require('./components/routines/evaluateProofs').start(5 * 1000, 60 * 1000);
                require('./components/routines/transferSharedAddressesToFundingTable').start(10 * 1000, 60 * 1000);
            } catch (e) {
                console.error(e, e.stack);
                process.exit();
            }
        },
        (err) => {
            console.log(`COULD NOT START: ${err}`);
            process.exit();
        }
    );
});