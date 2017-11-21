"use strict"
const Raven = require('raven');
module.exports = function (properties, stateMachine, state) {
    const Action = require('dagcoin-fsm/action');
    const action = new Action(properties, stateMachine, state);
    const accountManager = require(`dagcoin-core/accountManager`).getInstance();
    const conf = require('byteballcore/conf');
    const WalletManager = require('dagcoin-core/walletManager');
    const walletManager = new WalletManager();

    if (!properties.sharedAddress) {
        throw Error(`NO sharedAddress IN Action setStatus. PROPERTIES: ${properties}`);
    }

    action.execute = function () {
        return action.repeatPayment();
    };

    action.repeatPayment = function () {
        return action.sendPayment().then(
            () => {
                return Promise.resolve();
            },
            (error) => {
                return new Promise((resolve) => {
                    console.log(`COULD NOT SEND 5000 bytes TO ${properties.sharedAddress}: ${error}. RETRYING IN ${conf.MIN_RETRY_PAYMENT_DELAY} ms`);
                    setTimeout(() => {
                        action.repeatPayment().then(() => {
                            resolve();
                        })
                    }, conf.MIN_RETRY_PAYMENT_DELAY);
                });
            }
        );
    };

    action.sendPayment = function () {
        return accountManager.sendPayment(properties.sharedAddress, conf.BYTE_THRESHOLD_FOR_WARNING)
        .then(() => walletManager.readSingleAddress())
        .then((masterAddress) => accountManager.checkBytesForAddress(masterAddress))
        .then((bytesOnMasterAddress) => {
          if (bytesOnMasterAddress < 5000) {
            Raven.captureMessage('Funding node is low on bytes!', { level: 'warning' })
          }
        });
    };

    return action;
};
