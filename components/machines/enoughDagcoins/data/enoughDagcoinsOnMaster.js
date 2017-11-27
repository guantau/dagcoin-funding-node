"use strict"
const Raven = require('raven');
module.exports = function (properties, stateMachine, state) {
    const DataFetcher = require('dagcoin-fsm/lib/dataFetcher');
    const fetcher = new DataFetcher(properties, stateMachine, state);
    const conf = require('byteballcore/conf.js');
    const http = require('http');
    const dagcoinDbManager = require(`${__dirname}/../../../dagcoinDbManager`).getInstance();

    if (!properties.masterAddress) {
        throw Error(`NO masterAddress IN DataFetcher enoughDagcoins. PROPERTIES: ${properties}`);
    }

    fetcher.retrieveData = function () {
        return fetcher.getAddressDagcoinBalance(properties.masterAddress).then((balanceInMaster) => {
            stateMachine.setData('available-dagcoins', balanceInMaster);
            return Promise.resolve(balanceInMaster >= 500000);
        });
    };

    fetcher.getAddressDagcoinBalance = function (address) {
        return new Promise((resolve, reject) => {
            http.get(`http://localhost:9852/getAddressBalance?address=${address}`, (resp) => {
                let data = '';

                // A chunk of data has been received.
                resp.on('data', (chunk) => {
                    data += chunk;
                });

                // The whole response has been received. Print out the result.
                resp.on('end', () => {
                    try {
                        const balance = JSON.parse(data);

                        if (balance[conf.dagcoinAsset]) {
                            resolve(balance[conf.dagcoinAsset].stable);
                        } else {
                            resolve(0);
                        }
                    } catch (e) {
                        const message = `COULD NOT PARSE ${data} INTO A JSON OBJECT: ${e}`;
                        Raven.captureException(message);
                        reject(message);
                    }
                });
            }).on("error", (err) => {
              const message = `NO RESPONSE FROM THE HUB ABOUT AVAILABLE DAGCOINS: ${err.message}`;
              Raven.captureException(message);
              reject(message);
            });
        });
    };

    return fetcher;
};
