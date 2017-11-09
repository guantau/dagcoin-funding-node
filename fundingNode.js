/*jslint node: true */
"use strict";
const Raven = require('raven');
const conf = require('byteballcore/conf.js');
const eventBus = require('byteballcore/event_bus.js');
eventBus.setMaxListeners(120);

const accountManager = require('dagcoin-core/accountManager').getInstance();
const dbManager = require('./components/databaseManager').getInstance();
const proofManager = require('./components/proofManager').getInstance();
const deviceManager = require('dagcoin-core/deviceManager').getInstance();

let fundingExchangeProvider = null;
const followedAddress = {};

if (conf.sentryUrl) {
  Raven.config(conf.sentryUrl, {
    sendTimeout: 5,
    environment: conf.environment
  }).install();
}

if (conf.permanent_pairing_secret) {
    dbManager.query(
        "INSERT " + dbManager.getIgnore() + " INTO pairing_secrets (pairing_secret, is_permanent, expiry_date) VALUES (?, 1, '2038-01-01')",
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
        let sharedAddressJustUsed = null;

        for (let address in followedAddress) {
            const addressFsm = followedAddress[address];

            if (addressFsm.masterDeviceAddress === deviceAddress) {
                sharedAddressJustUsed = addressFsm;
            }
        }

        if (sharedAddressJustUsed == null) { //NEEDS TO BE LOADED
            dbManager.query(
                'SELECT shared_address, master_address, master_device_address, definition_type, ' +
                'status, created, last_status_change, previous_status FROM dagcoin_funding_addresses WHERE master_device_address = ?',
                [deviceAddress]
            ).then((rows) => {
                if (!rows || rows.length === 0) {
                    console.log(`REQUESTED TO LOAD A FUNDING ADDRESS NOT IN dagcoin_funding_addresses: ${deviceAddress}`);
                } else {
                    const fundingAddressFsm = require('./components/machines/fundingAddress/fundingAddress')(rows[0]);
                    fundingAddressFsm.start();

                    console.log(fundingAddressFsm.getCurrentState().getName());

                    followedAddress[rows[0].shared_address] = fundingAddressFsm;

                    fundingAddressFsm.pingUntilOver(false);
                }
            });
        } else {
            console.log(`PINGING ${sharedAddressJustUsed.shared_address}'S FSM BECAUSE A PAYMENT WAS DETECTED INVOLVING ITS MASTER DEVICE ADDRESS: ${deviceAddress}`);
            setTimeout(() => {
                // Delay to give time to the system to detect a payment before evaluating if the shared address needs funding
                sharedAddressJustUsed.pingUntilOver(true);
            }, 4000);
        }
    });

    // One device can send such message to check whether another device can exchange messages
    eventBus.on('dagcoin.is-connected', (fromAddress) => {
        console.log('DAGCOIN CONNECTION REQUEST');

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

            try {
                const fundingAddressFsm = require('./components/machines/fundingAddress/fundingAddress')(rows[0]);
                fundingAddressFsm.start();

                console.log(fundingAddressFsm.getCurrentState().getName());

                followedAddress[rows[0].shared_address] = fundingAddressFsm;

                return fundingAddressFsm.pingUntilOver(false);
            } catch (e) {
                console.error(e, e.stack);
                Raven.captureException(e);
            }
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

    eventBus.on('dagcoin.request.link-address', (fromAddress, message) => {
        console.log(`DAGCOIN link-address REQUEST: ${JSON.stringify(message)} FROM ${fromAddress}`);

        message.messageBody.device_address = fromAddress;

        proofManager.proofAddressAndSaveToDB(message.messageBody, fromAddress);
    });

    eventBus.on('dagcoin.request.load-address', (fromAddress, message) => {
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

                    return deviceManager.sendRequestAndListen(fromAddress, 'have-dagcoins', {}).then(
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
                Raven.captureException(e);
                process.exit();
            }
        },
        (err) => {
            console.log(`COULD NOT START: ${err}`);
            Raven.captureException(err);
            process.exit();
        }
    );
});

process.on('unhandledRejection', function (reason, p) {
    //I just caught an unhandled promise rejection, since we already have fallback handler for unhandled errors (see below), let throw and let him handle that
    throw reason;
});

process.on('uncaughtException', function(err) {
    console.log('Caught uncaughtException');
    require('dagcoin-core/exceptionManager').logError(err);
});

process.on('ERROR', function(err) {
    console.log('Caught ERROR');
    require('dagcoin-core/exceptionManager').logError(err);
});