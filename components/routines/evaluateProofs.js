/*jslint node: true */
"use strict";

const DatabaseManager = require('../databaseManager');
const dbManager = new DatabaseManager();
const promiseManager = require('../promiseManager');

const tag = 'evaluateProofs';

function execute() {
    return new Promise((resolve) => {
        dbManager.query(
            `SELECT address, address_definition, device_address, device_address_signature, master_address, master_address_signature, proofed 
             FROM dagcoin_proofs 
             WHERE proofed IS NULL`,
            [],
            (proofs) => {
                resolve(proofs);
            }
        );
    }).then((proofs) => {
        return proofManager.proofAddressBatch(proofs);
    }).then((proofingResult) => {
        return new Promise((resolve) => {
            if (proofingResult.invalidBatch.length === 0) {
                console.log('NO VALID PROOFS THIS TIME');
                resolve(proofingResult);
                return;
            }

            dbManager.query(
                'UPDATE dagcoin_proofs SET validated = 1 WHERE address IN ?',
                [proofingResult.validBatch],
                (updateResult) => {
                    console.log(`VALID PROOFS UPDATE SESSION RESULT: ${JSON.stringify(updateResult)}`);
                    resolve(proofingResult);
                }
            );
        });
    }).then((proofingResult) => {
        return new Promise((resolve) => {
            if (proofingResult.invalidBatch.length === 0) {
                console.log('NO INVALID PROOFS THIS TIME');
                resolve();
                return;
            }

            dbManager.query(
                'UPDATE dagcoin_proofs SET validated = 0 WHERE address IN ?',
                [invalidBatch],
                (updateResult) => {
                    console.log(`INVALID PROOFS UPDATE SESSION RESULT: ${JSON.stringify(updateResult)}`);
                    resolve(proofingResult.invalidBatch);
                }
            );
        });
    });
}

exports.start = (delay, period) => {
    setTimeout(() => {
        promiseManager.loopMethod(tag, period, execute);
    }, delay);
};
