'use strict';

var dbm;
var type;
var seed;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

exports.up = function(db) {
    try {
        return db.createTable('dagcoin_funding_addresses',
            {
                shared_address: {type: 'char', length: 32},
                master_address: {type: 'char', length: 32},
                master_device_address: {type: 'char', length: 33},
                definition_type : {type: 'smallint'},
                status: {type: 'char', length: 20},
                created: {type: 'date'},
                last_status_change: {type: 'date'},
                previous_status: {type: 'char', length: 20}
            }
        ).then(() => {
          db.runSql(`
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
              'LEGACY' as status,
              CURRENT_TIMESTAMP as created
            FROM
              shared_addresses sa,
              shared_address_signing_paths sasp
            WHERE
                sa.shared_address = sasp.shared_address
            AND sasp.address NOT IN (SELECT address FROM my_addresses);`
          ).then(
              () => {console.log('DATA COPIED TO dagcoin_funding_addresses')},
              (err) => {console.log(`COULD NOT COPY DATA TO dagcoin_funding_addresses BECAUSE: ${err}`);}
          );
        });
    } catch (e) {
        console.log(`COULD NOT MIGRATE: ${e}`);
        return Promise.reject(e);
    }
};

exports.down = function(db) {
    return db.dropTable('dagcoin_funding_addresses');
};

exports._meta = {
  "version": 1
};
