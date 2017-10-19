/*jslint node: true */
"use strict";
var conf = require('byteballcore/conf.js');
var db = require('byteballcore/db.js');
var eventBus = require('byteballcore/event_bus.js');

const AccountManager = require('./components/accountManager');
const accountManager = new AccountManager();
let fundingExchangeProvider = null;

const DatabaseManager = require('./components/databaseManager');
const dbManager = new DatabaseManager();

const ProofManager = require('./components/proofManager');
const proofManager = new ProofManager();

const promiseManager = require('./components/promiseManager');

const fundsNeedingAddresses = new Array();

if (conf.permanent_pairing_secret)
    db.query(
        "INSERT " + db.getIgnore() + " INTO pairing_secrets (pairing_secret, is_permanent, expiry_date) VALUES (?, 1, '2038-01-01')",
        [conf.permanent_pairing_secret]
    );

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
            function (rows) {
                const assocBalances = {};

                assocBalances["base"] = {stable: 0, pending: 0, total: 0};

                for (var i = 0; i < rows.length; i++) {
                    var row = rows[i];

                    console.log(`SOMETHING FOR ${sharedAddress}: ${JSON.stringify(row)}`);

                    var asset = row.asset || "base";

                    if (!assocBalances[asset]) {
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

function fund() {
    console.log('NEW FUNDING SESSION');

    if (!fundsNeedingAddresses || fundsNeedingAddresses.length === 0) {
        console.log('NO NEW ADDRESSES TO FUND');
        return new Promise((resolve) => {
            setTimeout(resolve, 30 * 1000);
        }).then(() => {
            return fund();
        });
    }

    const sharedAddress = fundsNeedingAddresses.pop();

    return accountManager.walletManager.readSingleAddress().then((myAddress) => {
        // FIND OWNING REMOTE ADDRESS
        return new Promise((resolve, reject) => {
            db.query(
                'SELECT address FROM shared_address_signing_paths WHERE shared_address = ? AND address <> ?',
                [sharedAddress, myAddress],
                (rows) => {
                    if (!rows || rows.length === 0) {
                        reject(`OWNER OF ${sharedAddress} NOT FOUND`);
                    } else if (rows.length > 1) {
                        reject(`TOO MANY OWNERs OF ${sharedAddress} FOUND: ${rows.length}`);
                    } else {
                        resolve(rows[0].address);
                    }
                }
            );
        });
    }).then((remoteOwningAddress) => { // TODO: rewrite from here on. Should not wait here, should return fund and execute globally inside a loop
        return new Promise((resolve, reject) => {
            const http = require('http');

            http.get(`http://localhost:9852/getAddressBalance?address=${remoteOwningAddress}`, (resp) => {
                let data = '';

                // A chunk of data has been received.
                resp.on('data', (chunk) => {
                    data += chunk;
                });

                // The whole response has been received. Print out the result.
                resp.on('end', () => {
                    try {
                        const balance = JSON.parse(data);

                        if (balance[conf.dagcoinAsset] && balance[conf.dagcoinAsset].stable >= 500000) {
                            resolve(true);
                        } else {
                            console.log(`NOT ENOUGH DAGCOINS CONFIRMED ON ${remoteOwningAddress} FOR FUNDING ITS SHARED ADDRESS`);
                            resolve(false);
                        }
                    } catch (e) {
                        reject(`COULD NOT PARSE ${data} INTO A JSON OBJECT: ${e}`);
                    }
                });
            }).on("error", (err) => {
                reject(err.message);
            });
        });
    }).then(
        (hasEnoughDagcoins) => {
            if (hasEnoughDagcoins) {
                return accountManager.sendPayment(sharedAddress, 5000).then(
                    () => {
                        return new Promise((resolve) => {
                            setTimeout(resolve, 30 * 1000);
                        });
                    },
                    (err) => {
                        console.log(err);
                    }
                );
            } else {
                console.log(`WILL NOT FUND ${sharedAddress}, THE REMOTE OWNER DOES NOT HAVE ENOUGH DAGCOINS`);
                return Promise.resolve();
            }
        },
        (err) => {
            console.log(`AN ERROR OCCURRED: ${err}`);
            return Promise.resolve();
        }
    ).then(() => {
        return fund();
    });
}

function fundSharedAddresses() {
    // LOGGING IN IF THE CONNECTION WAS LOST
    const device = require('byteballcore/device.js');
    device.loginToHub();

    db.query('SELECT shared_address FROM shared_addresses', [], (rows) => {
        console.log('UPDATING FUND OF SHARED ADDRESSES');
        for (let index in rows) {
            const sharedAddress = rows[index].shared_address;

            getSharedAddressBalance(sharedAddress).then((assocBalances) => {
                console.log(`BALANCE FOR ${sharedAddress}: ${JSON.stringify(assocBalances)}`);

                const baseBalance = assocBalances['base'].total || 0;

                if (baseBalance < 5000) {
                    if (fundsNeedingAddresses.indexOf(sharedAddress) < 0) {
                        console.log(`ADDRESS ${sharedAddress} SHOULD BE FUNDED AS IT HAS JUST ${baseBalance} BYTES`);
                        fundsNeedingAddresses.push(sharedAddress);
                    }
                }
            });
        }

        console.log();
    });
}

function loadFirstFundingAddress () {
    let fundingAddressFsm;
    dbManager.query(
        `SELECT 
            shared_address, master_address, master_device_address, definition_type, status, created, last_status_change, previous_status
        FROM dagcoin_funding_addresses`, []
    ).then((rows) => {
        fundingAddressFsm = require('./components/machines/fundingAddress/fundingAddress')(rows[0]);
        console.log(fundingAddressFsm.getCurrentState().getName());
        return fundingAddressFsm.recursivePingSafe();
    }).then(() => {
        console.log(fundingAddressFsm.getCurrentState().getName());
    });
}

dbManager.checkOrUpdateDatabase().then(() => {
    loadFirstFundingAddress();

    /* accountManager.readAccount().then(
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

                setInterval(fundSharedAddresses, 60 * 1000);

                // SETTING UP THE LOOPS
                require('./components/routines/evaluateProofs').start(5 * 1000, 60 * 1000);
                require('./components/routines/transferSharedAddressesToFundingTable').start(10 * 1000, 60 * 1000);
            } catch (e) {
                console.log(e);
                process.exit();
            }
        },
        (err) => {
            console.log(`COULD NOT START: ${err}`);
            process.exit();
        }
    );

    fund();*/
});