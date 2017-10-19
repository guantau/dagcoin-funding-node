'use strict';

var dbm;
var type;
var seed;

/**
 * We receive the dbmigrate dependency from dbmigrate initially.
 * This enables us to not have to rely on NODE_PATH.
 */
exports.setup = function (options, seedLink) {
    dbm = options.dbmigrate;
    type = dbm.dataType;
    seed = seedLink;
};

exports.up = function (db) {
    try {
        return db.createTable('dagcoin_linked_addresses',
            {
                shared_address: {type: 'char', length: 32},
                master_address: {type: 'char', length: 32},
                linked_address: {type: 'char', length: 32},
                device_address: {type: 'char', length: 33},
                proofed: {type: 'boolean'}
            }
        );
    } catch (e) {
        console.log(`COULD NOT MIGRATE: ${e}`);
        return Promise.reject(e);
    }
};

exports.down = function (db) {
    return db.dropTable('dagcoin_linked_addresses');
};

exports._meta = {
    "version": 1
};
