/*jslint node: true */
"use strict";

const DatabaseManager = require('../databaseManager');
const dbManager = DatabaseManager.getInstance();
const promiseManager = require('../promiseManager');
const proofManager = require('../proofManager').getInstance();

const tag = 'evaluateProofs';

function execute() {
    return dbManager.query(
        `SELECT address, address_definition, device_address, device_address_signature, master_address, master_address_signature, proofed 
         FROM dagcoin_proofs 
         WHERE proofed IS NULL`,
        []
    ).then((proofs) => {
        return proofManager.proofAddressBatch(proofs);
    }).then((proofingResult) => {
        if (proofingResult.validBatch.length === 0) {
            console.log('NO VALID PROOFS THIS TIME');
            return Promise.resolve(proofingResult);
        }

        return dbManager.query(
            'UPDATE dagcoin_proofs SET validated = 1 WHERE address IN ?',
            [proofingResult.validBatch]
        ).then((updateResult) => {
            console.log(`VALID PROOFS UPDATE SESSION RESULT: ${JSON.stringify(updateResult)}`);
            return Promise.resolve(proofingResult);
        });
    }).then((proofingResult) => {
        if (proofingResult.invalidBatch.length === 0) {
            console.log('NO INVALID PROOFS THIS TIME');
            return Promise.resolve();
        }

        return dbManager.query(
            'UPDATE dagcoin_proofs SET validated = 0 WHERE address IN ?',
            [invalidBatch]
        ).then((updateResult) => {
            console.log(`INVALID PROOFS UPDATE SESSION RESULT: ${JSON.stringify(updateResult)}`);
            resolve(proofingResult.invalidBatch);
        });
    });
}

exports.start = (delay, period) => {
    setTimeout(() => {
        promiseManager.loopMethod(tag, period, execute);
    }, delay);
};
