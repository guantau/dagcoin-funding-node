/*jslint node: true */
"use strict";
var conf = require('byteballcore/conf.js');
var db = require('byteballcore/db.js');
var eventBus = require('byteballcore/event_bus.js');

const accountManager = require('./components/accountManager').getInstance();
const dbManager = require('./components/databaseManager').getInstance();
const proofManager = require('./components/proofManager').getInstance();
const dagcoinProtocolManager = require('./components/dagcoinProtocolManager').getInstance();

let fundingExchangeProvider = null;
const followedAddress = {};

if (conf.permanent_pairing_secret) {
    dbManager.query(
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

    eventBus.on('internal.dagcoin.payment-approved', (deviceAddress) => {
        for (let address in followedAddress) {
            const addressFsm = followedAddress[address];

            if (addressFsm.masterDeviceAddress === deviceAddress) {
                console.log(`PINGING ${address}'S FSM BECAUSE A PAYMENT WAS DETECTED INVOLVING ITS MASTER DEVICE ADDRESS: ${deviceAddress}`);
                setTimeout(() => {
                    // Delay to give time to the system to detect a payment before evaluating if the shared address needs funding
                    addressFsm.pingUntilOver(true);
                }, 4000);
            }
        }
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
            fundingAddressFsm.start();

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
                const fundingAddressFsm = require('./components/machines/fundingAddress/fundingAddress')(fundingAddressObject);
                console.log(`FUNDING FSM CREATED FOR ${JSON.stringify(fundingAddressObject)}`);
                fundingAddressFsm.start();
                fundingAddressFsm.pingUntilOver(false).then(() => {
                    console.log(`FINISHED PINGING ${fundingAddressObject.shared_address}. CURRENT STATUS: ${fundingAddressFsm.getCurrentState().getName()}`);
                });
                followedAddress[fundingAddressObject.shared_address] = fundingAddressFsm;
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
                        console.log(`DEVICE ADDRESS ${fromAddress} NEITHER IN dagcoin_funding_addresses NOR IN shared_address_signing_paths`);
                        return Promise.resolve();
                    }

                    const sharedAddress = rows[0].shared_address;

                    return dagcoinProtocolManager.sendRequestAndListen(fromAddress, 'have-dagcoins', {}).then(
                        (messageBody) => {
                            const proofs = messageBody.proofs;

                            if (!proofs || proofs.length === 0) {
                                console.log(`REQUEST have-dagcoins DID NOT PROVIDE NEW ADDRESSES FOR ${fromAddress}. COULD BE LEGACY`);
                                return Promise.resolve();
                            }

                            console.log(`PROOFS: ${JSON.stringify(proofs)}`);

                            return proofManager.proofAddressBatch(proofs, fromAddress);
                        },
                        (error) => { //Most likely timeout because a legacy client cannot reply to this request
                            console.log(`COULD NOT COMPLETE have-dagcoins REQUEST: ${error}`);
                            return dbManager.query(
                                'SELECT status FROM dagcoin_funding_addresses WHERE shared_address = ?',
                                [sharedAddress]
                            ).then((rows) => {
                                if (!rows || rows.length === 0) {
                                    throw Error (`COULD NOT FIND SHARED ADDRESS ${sharedAddress}`);
                                }

                                if (rows.length > 1) {
                                    throw Error (`TOO MANY SHARED ADDRESSES FOR ${sharedAddress}: ${rows.length}`);
                                }

                                const newStatus = 'LEGACY';

                                if (rows[0].status !== newStatus) {
                                    return dbManager.query('UPDATE dagcoin_funding_addresses ' +
                                        'SET status = ?, previous_status = ?, last_status_change = CURRENT_TIMESTAMP WHERE shared_address = ?',
                                        [newStatus, rows[0].status, sharedAddress]
                                    );
                                } else {
                                    return Promise.resolve();
                                }
                            });
                        }
                    );
                });
            }

            if (followedAddress[rows[0].shared_address]) {
                console.log(`ALREADY FOLLOWING ${rows[0].shared_address}`);
                followedAddress[rows[0].shared_address].pingUntilOver(false);
                return Promise.resolve();
            }

            const fundingAddressFsm = require('./components/machines/fundingAddress/fundingAddress')(rows[0]);
            fundingAddressFsm.start();

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