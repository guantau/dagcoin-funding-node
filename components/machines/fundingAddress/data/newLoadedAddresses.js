"use strict"

module.exports = function (properties) {
    const DataFetcher = require(`${__dirname}/../../../fsm/dataFetcher`);
    const fetcher = new DataFetcher(properties);
    const dagcoinProtocolManager = require(`${__dirname}/../../../dagcoinProtocolManager`).getInstance();
    const proofManager = require(`${__dirname}/../../../proofManager`).getInstance();

    if (!properties.deviceAddress) {
        throw Error(`NO deviceAddress IN DataFetcher newLoadedAddresses. PROPERTIES: ${properties}`);
    }

    fetcher.retrieveData = function () {
        dagcoinProtocolManager.sendRequestAndListen(properties.deviceAddress, 'have-dagcoins', {}).then((messageBody) => {
            const proofs = messageBody.proofs;

            if (!proofs || proofs.length === 0) {
                console.log(`REQUEST have-dagcoins DID NOT PROVIDE NEW ADDRESSES. CHECK WHETHER THERE ARE ERRORS`);
                return Promise.resolve();
            }

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

    return fetcher;
};