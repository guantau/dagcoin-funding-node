/*jslint node: true */
"use strict";

const DatabaseManager = require('../databaseManager');
const dbManager = DatabaseManager.getInstance();
const promiseManager = require('../promiseManager');

const tag = 'transferSharedAddressesToFundingTable';

const activeFundingAddressFsms = [];

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
              'NOT_PROOFED' as status,
              CURRENT_TIMESTAMP as created
            FROM
              shared_addresses sa,
              shared_address_signing_paths sasp 
              left join dagcoin_proofs dp on dp.address =  sasp.address
            WHERE
                sa.shared_address = sasp.shared_address
            AND sasp.address NOT IN (SELECT address FROM my_addresses)
            AND sa.shared_address NOT IN (SELECT shared_address FROM dagcoin_funding_addresses);`,
        []
    ).then((rows) => {
        console.log(`QUERY RESULT OF ROUTINE ${tag}: ${JSON.stringify(rows)}`);

        return dbManager.query(
            `SELECT 
            shared_address, master_address, master_device_address, definition_type, status, created, last_status_change, previous_status
        FROM dagcoin_funding_addresses WHERE status = ?`, ['NOT_PROOFED']
        );
    }).then((fundingAddresses) => {
        if (!fundingAddresses || fundingAddresses.length == 0) {
            console.log('NO NEW FUNDING ADDRESSES TO FOLLOW');
            return Promise.resolve();
        }

        fundingAddresses.forEach((fundingAddressObject) => {
            const fundingAddressFsm = require('../machines/fundingAddress/fundingAddress')(fundingAddressObject);
            console.log(`FUNDING FSM CREATED FOR ${JSON.stringify(fundingAddressObject)}`);
            fundingAddressFsm.pingUntilOver(false).then(() => {
                console.log(`FINISHED PINGING ${fundingAddressObject.shared_address}. CURRENT STATUS: ${fundingAddressFsm.getCurrentState()}`);
            });
            activeFundingAddressFsms.push(fundingAddressFsm);
        });
    });
}

exports.start = (delay, period) => {
    setTimeout(() => {
        promiseManager.loopMethod(tag, period, execute);
    }, delay);
};
