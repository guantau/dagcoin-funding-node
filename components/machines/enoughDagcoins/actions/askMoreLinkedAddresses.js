"use strict"

module.exports = function (properties, stateMachine, state) {
    const Action = require('dagcoin-fsm/action');
    const action = new Action(properties, stateMachine, state);
    const deviceManager = require('dagcoin-core/lib/deviceManager').getInstance();
    const proofManager = require(`${__dirname}/../../../proofManager`).getInstance();

    if (!properties.deviceAddress) {
        throw Error(`NO deviceAddress IN Action askMoreLinkedAddresses. PROPERTIES: ${JSON.stringify(properties)}`);
    }

    action.execute = function () {
        deviceManager.sendRequestAndListen(properties.deviceAddress, 'have-dagcoins', {}).then((messageBody) => {
            const proofs = messageBody.proofs;

            if (!proofs || proofs.length === 0) {
                console.log(`REQUEST have-dagcoins DID NOT PROVIDE NEW ADDRESSES. CHECK WHETHER THERE ARE ERRORS`);
                return Promise.resolve();
            }

            console.log(`PROOFING ${JSON.stringify(proofs)} WITH ${properties.deviceAddress}`);

            return proofManager.proofAddressBatch(proofs, properties.deviceAddress);
        }).then(
            () => {
                return Promise.resolve(true);
            },
            (error) => {
                console.log(`FAILED COMPLETING have-dagcoins REQUEST: ${error}`);
                return Promise.resolve(true);
            }
        );
    };

    return action;
};