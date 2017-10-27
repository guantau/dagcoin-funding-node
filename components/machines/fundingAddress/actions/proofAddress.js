"use strict"

module.exports = function (properties) {
    const Action = require(`${__dirname}/../../../fsm/action`);
    const action = new Action(properties);
    const dbManager = require(`${__dirname}/../../../databaseManager`).getInstance();
    const dagcoinProtocolManager = require(`${__dirname}/../../../dagcoinProtocolManager`).getInstance();
    const proofManager = require(`${__dirname}/../../../proofManager`).getInstance();

    if (!properties.address) {
        throw Error(`NO address IN Action proofAddress. PROPERTIES: ${properties}`);
    }

    if (!properties.deviceAddress) {
        throw Error(`NO deviceAddress IN Action proofAddress. PROPERTIES: ${properties}`);
    }

    action.execute = function () {
        return dbManager.query(
            'SELECT address FROM dagcoin_proofs WHERE address = ? AND device_address = ? AND proofed = ?',
            [properties.address, properties.deviceAddress, 1]
        ).then((rows) => {
            if (rows && rows.length === 1) {
                // NO NEED OF FURTHER PROOFING
                return Promise.resolve();
            } else {
                return action.sendProofRequest()
            }
        });
    };

    action.sendProofRequest = function () {
        const request = {
            addresses: properties.address
        };

        return dagcoinProtocolManager.sendRequestAndListen(properties.deviceAddress, 'proofing', request).then((messageBody) => {
            const proofs = messageBody.proofs;

            console.log(`PROOFS: ${JSON.stringify(proofs)}`);

            if (!proofs || proofs.length === 0) {
                return Promise.reject(`NO PROOFS PROVIDED IN THE CLIENT RESPONSE FOR ${properties.address}`);
            } else {
                return Promise.resolve(proofs);
            }
        }).then((proofs) => {
            proofManager.proofAddressBatch(proofs, properties.deviceAddress);
        });
    };

    return action;
};