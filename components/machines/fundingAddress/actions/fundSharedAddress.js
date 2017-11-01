"use strict"

module.exports = function (properties, stateMachine, state) {
    const Action = require('dagcoin-fsm/action');
    const action = new Action(properties, stateMachine, state);
    const accountManager = require(`${__dirname}/../../../accountManager`).getInstance();

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
                    console.log(`COULD NOT SEND 5000 bytes TO ${properties.sharedAddress}: ${error}. RETRYING IN 5 MINUTES`);
                    setTimeout(() => {
                        action.repeatPayment().then(() => {
                            resolve();
                        })
                    }, 60 * 1000);
                });
            }
        );
    };

    action.sendPayment = function () {
        return accountManager.readAccount().then(() => {
            return accountManager.sendPayment(properties.sharedAddress, 5000);
        });
    };

    return action;
};