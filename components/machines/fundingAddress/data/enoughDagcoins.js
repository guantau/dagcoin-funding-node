"use strict"

module.exports = function (properties) {
    const DataFetcher = require(`${__dirname}/../../../fsm/dataFetcher`);
    const fetcher = new DataFetcher(properties);
    const conf = require('byteballcore/conf.js');
    const http = require('http');

    if (!properties.masterAddress) {
        throw Error(`NO masterAddress IN DataFetcher enoughDagcoins. PROPERTIES: ${properties}`);
    }

    // TODO: lookup all address linked to the masterAddress and ask for the sum of their balance.
    fetcher.retrieveData = function () {
        return new Promise((resolve, reject) => {
            http.get(`http://localhost:9852/getAddressBalance?address=${properties.masterAddress}`, (resp) => {
                let data = '';

                // A chunk of data has been received.
                resp.on('data', (chunk) => {
                    data += chunk;
                });

                // The whole response has been received. Print out the result.
                resp.on('end', () => {
                    try {
                        const balance = JSON.parse(data);

                        if (balance[conf.dagcoinAsset] && balance[conf.dagcoinAsset].stable >= 500000) {
                            resolve(true);
                        } else {
                            console.log(`NOT ENOUGH DAGCOINS CONFIRMED ON ${properties.masterAddress} FOR FUNDING ITS SHARED ADDRESS`);
                            resolve(false);
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