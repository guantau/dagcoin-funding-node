"use strict"

module.exports = function (properties, stateMachine, state) {
    const DataFetcher = require('dagcoin-fsm/dataFetcher');
    const fetcher = new DataFetcher(properties, stateMachine, state);

    if (!properties.masterAddress) {
        throw Error(`NO masterAddress IN DataFetcher enoughDagcoins. PROPERTIES: ${properties}`);
    }

    if (!properties.deviceAddress) {
        throw Error(`NO deviceAddress IN DataFetcher enoughDagcoins. PROPERTIES: ${properties}`);
    }

    fetcher.retrieveData = function () {
        const enoughDagcoinsFsm = require(`${__dirname}/../../enoughDagcoins/enoughDagcoins`)(properties.masterAddress, properties.deviceAddress);

        enoughDagcoinsFsm.start();

        return enoughDagcoinsFsm.pingUntilOver().then(() => {
            if (!enoughDagcoinsFsm.getCurrentState().isFinal) {
                throw Error(`STATE MACHINE enoughDagcoinsFsm CURRENT STATE SHOULD BE FINAL. IT IS: ${enoughDagcoinsFsm.getCurrentState().getName()}`);
            }
            return enoughDagcoinsFsm.waitForFinalState();
        }).then(() => {
            return Promise.resolve(enoughDagcoinsFsm.getData('available-dagcoins') > 500000);
        });
    };

    return fetcher;
};