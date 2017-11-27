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
        return dagcoinDbManager.getLinkedAddresses(properties.masterAddress).then((addresses) => {
            const fundCheckPromises = [];

            if (addresses && addresses.length > 0) {
               for(let i = 0; i < addresses.length; i += 1) {
                   console.log(`CHECKING dagcoins AVAILABLE ON ${addresses[i]}`);
                   if (addresses[i] !== properties.masterAddress) {
                       fundCheckPromises.push(fetcher.getAddressDagcoinBalance(addresses[i]));
                   }
               }
            }

            return Promise.all(fundCheckPromises);
        }).then((values) => {
            let totalDagcoins = stateMachine.getData('available-dagcoins', 0);

            console.log(`VALUE AVAILABLE: ${totalDagcoins}`);
            console.log(`VALUES RECEIVED: ${JSON.stringify(values)}`);

            if (values && values.length > 0) {
                for (let i = 0; i < values.length; i += 1) {
                    totalDagcoins += values[i];
                }
            }

            stateMachine.setData('available-dagcoins', totalDagcoins);

            if (totalDagcoins >= 500000) {
                return Promise.resolve(true);
            } else {
                console.log(`NOT ENOUGH DAGCOINS CONFIRMED ON ${properties.masterAddress} FOR FUNDING ITS SHARED ADDRESS: ${totalDagcoins}`);
                return Promise.resolve(false);
            }
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
                reject(`NO RESPONSE FROM THE HUB ABOUT AVAILABLE DAGCOINS: ${err.message}`);
            });
        });
    };

    return fetcher;
};
