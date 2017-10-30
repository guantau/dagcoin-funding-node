'use strict';

let instance = null;

// My module
function DagcoinDbManager() {
    this.dbManager = require('./databaseManager').getInstance();
    this.conf = require('byteballcore/conf');
    this.timedPromises = require('./promiseManager');

    const FileSystemManager = require('./fileSystemManager');
    this.fileSystemManager = new FileSystemManager();
}

DagcoinDbManager.prototype.query = function (query, parameters) {
    return this.dbManager.query(query, parameters);
};

DagcoinDbManager.prototype.getWalletMasterAddress = function (address) {
    return this.dbManager.query(
        'SELECT address, master_address FROM dagcoin_proofs WHERE address = ?',
        [address]
    ).then((rows) => {
        if (!rows || rows.length === 0) {
            return Promise.resolve(null);
        }

        if (rows.length > 1) {
            return Promise.reject(`TOO MANY MASTER ADDRESSES FOR ${address}`);
        }

        if (rows[0].master_address) {
            return Promise.resolve(rows[0].master_address);
        }

        return Promise.resolve(rows[0].address);
    });
};

DagcoinDbManager.prototype.getSharedMasterAddress = function (address) {
    return this.dbManager.query('SELECT address FROM shared_address_signing_paths WHERE device_address = ?', [deviceAddress]);
};

DagcoinDbManager.prototype.hasFundingSharedAddress = function (deviceAddress) {
    return this.dbManager.query(
        'SELECT address FROM shared_address_signing_paths WHERE device_address = ?',
        [deviceAddress]
    ).then((rows) => {
        return rows && rows.length > 0;
    });
};

DagcoinDbManager.prototype.hasRegisteredFundingAddress = function (deviceAddress) {
    return this.dbManager.query(
        'SELECT address FROM dagcoin_fundind_addresses WHERE master_device_address = ?',
        [deviceAddress]
    ).then((rows) => {
        return rows && rows.length > 0;
    });
};

DagcoinDbManager.prototype.getLinkedAddresses = function (address) {
    const self = this;

    return self.getWalletMasterAddress(address).then((masterAddress) => {
        if (!masterAddress) {
            return Promise.resolve(null);
        }

        return self.dbManager.query(
            'SELECT address FROM dagcoin_proofs WHERE (address = ? OR master_address = ?) AND proofed = ? AND address NOT IN (?)',
            [masterAddress, masterAddress, 1, [address]]
        ).then((rows) => {
            const addresses = [address];

            if (!rows || rows.length === 0) {
                return Promise.resolve(addresses);
            }

            for (let i = 0; i < rows.length; i += 1) {
                addresses.push(rows[i].address);
            }

            console.log(`ADDRESSES LINKED TO ${address}: ${JSON.stringify(addresses)}`);

            return Promise.resolve(addresses);
        });
    });
};

module.exports = DagcoinDbManager;
module.exports.getInstance = function () {
    if (!instance) {
        instance = new DagcoinDbManager();
    }

    return instance;
};