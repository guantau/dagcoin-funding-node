/*jslint node: true */
"use strict";

const DatabaseManager = require('../databaseManager');
const dbManager = new DatabaseManager();
const promiseManager = require('../promiseManager');

const tag = 'transferSharedAddressesToFundingTable';

function execute() {
    return dbManager.query(            `
            INSERT INTO dagcoin_funding_addresses (
              shared_address,
              master_address,
              master_device_address,
              definition_type,
              status,
              created
            )
            SELECT
              sa.shared_address,
              sasp.address,
              sasp.device_address,
              (sa.definition LIKE '%or%') + 1 as definition_type,
              'NEW' as status,
              CURRENT_TIMESTAMP as created
            FROM
              shared_addresses sa,
              shared_address_signing_paths sasp,
              dagcoin_proofs
            WHERE
                sa.shared_address = sasp.shared_address
            AND sasp.address NOT IN (SELECT address FROM my_addresses)
            AND sa.shared_address NOT IN (SELECT shared_address FROM dagcoin_funding_addresses);`,
        []
    ).then((rows) => {
        console.log(`QUERY RESULT OF ROUTINE ${tag}: ${JSON.stringify(rows)}`);
    });
}

exports.start = (delay, period) => {
    setTimeout(() => {
        promiseManager.loopMethod(tag, period, execute);
    }, delay);
};
