'use strict';

// My module
function DatabaseManager() {
    this.db = require('byteballcore/db');
    this.conf = require('byteballcore/conf');
    this.timedPromises = require('./promiseManager');

    const FileSystemManager = require('./fileSystemManager');
    this.fileSystemManager = new FileSystemManager();

    const self = this;

    this.queryQueue = this.timedPromises.PromiseEnqueuer(
        'db-manager',
        (query, parameters) => {
            return new Promise((resolve, reject) => {
                try {
                    self.db.query(query, parameters, resolve);
                } catch (e) {
                    console.error(e, e.stack);
                    reject(`QUERY ${query} WITH PARAMETER ${JSON.stringify(parameters)} FAILED: ${e.message}`);
                }
            });
        }
    );
}

DatabaseManager.prototype.checkOrUpdateDatabase = function () {
    const self = this;

    const databaseConfigFileName = `database.json`;

    console.log(`CHECKING OR UPDATING DATABASE STATUS. FIRST CHECK: ${databaseConfigFileName}`);

    return self.onReady().then(() => {
        return self.fileSystemManager.readFile(databaseConfigFileName).then(
            (data) => {
                //FILE EXISTS
                console.log(`FILE ${databaseConfigFileName} EXISTS`);
                return Promise.resolve();
            },
            (error) => {
                //FILE DOES NOT EXIST
                console.log(`ERROR READING DATABASE CONFIGURATION FILE NAME (${databaseConfigFileName}). PROBABLY IT DOESN'T EXIST: ${error}`);
                const databaseAccessConfiguration = `{
    "${self.conf.environment}": {
        "driver": "sqlite3",
        "filename": "${self.getFullDatabasePath()}"
    }
}`;

                return self.fileSystemManager.writeFile(
                    databaseConfigFileName,
                    databaseAccessConfiguration,
                    self.fileSystemManager.getDefaultEncoding()
                );
            }
        ).then(() => {
            const dbMigrate = require('db-migrate').getInstance(true, {env: self.conf.environment});
            return dbMigrate.down(3).then(() => {
                return dbMigrate.up(3).then(() => {console.log('MIGRATED');});
            });
        }).catch((error) => {
            console.log(`FAILED CHECKING/UPDATING THE DATABASE: ${error}`);
            console.log(`STRINGIFIED ERROR: ${JSON.stringify(error)}`);
            process.exit();
        });
    });
};

DatabaseManager.prototype.getDatabaseDirPath = function () {
    return this.fileSystemManager.getAppDataDir();
};

DatabaseManager.prototype.getDatabaseFileName = function () {
    return this.conf.database.filename || (this.conf.bLight ? 'byteball-light.sqlite' : 'byteball.sqlite');
};

DatabaseManager.prototype.getFullDatabasePath = function () {
    return `${this.getDatabaseDirPath()}/${this.getDatabaseFileName()}`
};

DatabaseManager.prototype.checkCondition = function (query, condition, timeout, times, messages) {
    const self = this;

    return new Promise((resolve, reject) => {
        self.db.query(query, function (rows) {
            if (condition(rows)) {
                resolve(true);
            } else {
                reject();
            }
        });
    });
};

/**
 * Makes sure the database is ready.
 * @returns {Promise} A promise that resolves as soon as the database is ready
 */
DatabaseManager.prototype.onReady = function () {
    const self = this;

    return new Promise((resolve) => {
        self.db.query('SELECT 1', [], () => {
            resolve();
        });
    });
};

/**
 * Executes query in the database sequentially.
 * @param query A SQL query with question marks (?) instead of parameters
 * @param parameters An array of parameters. [] for nothing
 * @returns {Promise} A promise that resolves when the query returns rows.
 */
DatabaseManager.prototype.query = function (query, parameters) {
    return this.queryQueue.enqueue(query, parameters);
};

module.exports = DatabaseManager;