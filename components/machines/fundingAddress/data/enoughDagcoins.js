"use strict"

module.exports = function (properties) {
    const DataFetcher = require(`${__dirname}/../../../fsm/dataFetcher`);
    const fetcher = new DataFetcher(properties);
    const conf = require('byteballcore/conf.js');
    const http = require('http');
    const DatabaseManager = require(`${__dirname}/../../../databaseManager`);
    const dbManager = new DatabaseManager();

    if (!properties.masterAddress) {
        throw Error(`NO masterAddress IN DataFetcher enoughDagcoins. PROPERTIES: ${properties}`);
    }

    fetcher.retrieveData = function () {
        return dbManager.query(
            'SELECT address FROM dagcoin_proofs WHERE master_address = ? AND proofed = 1',
            [properties.masterAddress]
        ).then((rows) => {
            const fundCheckPromises = [];
            fundCheckPromises.push(fetcher.getAddressDagcoinBalance(properties.masterAddress));

            if (rows && rows.length > 0) {
               for(let i = 0; i < rows.length; i+=1) {
                   fundCheckPromises.push(fetcher.getAddressDagcoinBalance(rows[i].address));
               }
            }

            return Promise.all(fundCheckPromises);
        }).then((values) => {
            let totalDagcoins = 0;

            if (values && values.length > 0) {
                for (let i = 0; i < values.length; i += 1) {
                    totalDagcoins += values[i];
                }
            }

            if (totalDagcoins >= 500000) {
                return Promise.resolve(true);
            } else {
                console.log(`NOT ENOUGH DAGCOINS CONFIRMED ON ${properties.masterAddress} FOR FUNDING ITS SHARED ADDRESS`);
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
                        reject( `COULD NOT PARSE ${data} INTO A JSON OBJECT: ${e}`);
                    }
                });
            }).on("error", (err) => {
                reject(`NO RESPONSE FROM THE HUB ABOUT AVAILABLE DAGCOINS: ${err.message}`);
            });
        });
    };

    return fetcher;
};