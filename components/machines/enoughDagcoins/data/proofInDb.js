"use strict"

module.exports = function (properties, stateMachine, state) {
    const DataFetcher = require('dagcoin-fsm/dataFetcher');
    const fetcher = new DataFetcher(properties, stateMachine, state);
    const dbManager = require(`dagcoin-core/databaseManager`).getInstance();

    if (!properties.address) {
        throw Error(`NO address IN DataFetcher proofInDb. PROPERTIES: ${properties}`);
    }

    if (!properties.deviceAddress) {
        throw Error(`NO deviceAddress IN DataFetcher proofInDb. PROPERTIES: ${properties}`);
    }

    fetcher.retrieveData = function () {
        return dbManager.query(
            'SELECT address FROM dagcoin_proofs WHERE address = ? AND device_address = ? AND proofed = ?',
            [properties.address, properties.deviceAddress, 1]
        ).then((rows) => {
            const proofInDb = rows && rows.length === 1;

            if (!proofInDb) {
                const proofManager = require('../../../proofManager').getInstance();

                proofManager.askForProofs(properties.deviceAddress, [properties.address]).catch((e) => {
                    require('dagcoin-core/exceptionManager').logError(e);
                });
            }

            return Promise.resolve(proofInDb);
        });
    };

    return fetcher;
};