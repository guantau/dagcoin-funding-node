"use strict"

module.exports = function (properties, stateMachine, state) {
    const Action = require('dagcoin-fsm/action');
    const action = new Action(properties, stateMachine, state);
    const DatabaseManager = require(`${__dirname}/../../../databaseManager`);
    const dbManager = DatabaseManager.getInstance();

    if (!properties.sharedAddress) {
        throw Error(`NO sharedAddress IN Action setStatus. PROPERTIES: ${properties}`);
    }

    if (!properties.status) {
        throw Error(`NO status IN Action setStatus. PROPERTIES: ${properties}`);
    }

    action.execute = function () {
        return dbManager.query(
            'SELECT status FROM dagcoin_funding_addresses WHERE shared_address = ?',
            [properties.sharedAddress]
        ).then((rows) => {
            if(!rows || rows.length === 0) {
                throw Error (`IN Action ${properties.name}: COULD NOT FIND SHARED ADDRESS ${properties.sharedAddress}`);
            }

            if(rows.length > 1) {
                throw Error (`IN Action ${properties.name}: TOO MANY SHARED ADDRESSES FOR ${properties.sharedAddress}: ${rows.length}`);
            }

            if (rows[0].status !== properties.status && (rows[0].status != 'LEGACY' || properties.status == 'VOID')) {
                return dbManager.query(`UPDATE dagcoin_funding_addresses
                    SET status = ?, previous_status = ?, last_status_change = CURRENT_TIMESTAMP WHERE shared_address = ?`,
                    [properties.status, rows[0].status, properties.sharedAddress]
                );
            } else {
                return Promise.resolve();
            }
        });
    };

    return action;
};