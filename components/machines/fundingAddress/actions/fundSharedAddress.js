"use strict"

module.exports = function (properties) {
    const Action = require(`${__dirname}/../../../fsm/action`);
    const action = new Action(properties);
    const AccountManager = require(`${__dirname}/../../../accountManager`);
    const accountManager = new AccountManager();

    if (!properties.sharedAddress) {
        throw Error(`NO sharedAddress IN Action setStatus. PROPERTIES: ${properties}`);
    }

    action.execute = function () {
        return action.repeatPayment();
    };

    action.repeatPayment = function () {
        action.sendPayment().then(
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
        )
    };

    action.sendPayment = function () {
        return accountManager.readAccount().then(() => {
            return accountManager.sendPayment(properties.sharedAddress, 5000);
        });
    };

    return action;
};