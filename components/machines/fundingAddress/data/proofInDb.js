"use strict"

module.exports = function (properties) {
    const DataFetcher = require(`${__dirname}/../../../fsm/dataFetcher`);
    const fetcher = new DataFetcher(properties);
    const DatabaseManager = require(`${__dirname}/../../../databaseManager`);
    const dbManager = new DatabaseManager();

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
            return Promise.resolve(rows && rows.length === 1);
        });
    };

    return fetcher;
};