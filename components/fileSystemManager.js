'use strict';

// My module
function FileSystemManager () {
    this.fs = require('fs');
    try {
        this.desktopApp = require('byteballcore/desktop_app.js');
    } catch (e) {
        console.log(`COULD NOT INITIALIZE desktopApp INSIDE FileSystem CONSTRUCTOR: ${e}`);
    }
}

FileSystemManager.prototype.readFile = function (path) {
    const self = this;

        return new Promise((resolve, reject) => {
        self.fs.readFile(path, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
};

FileSystemManager.prototype.getPath = function (path) {
    return path.replace(/\\/g, '/');
};

FileSystemManager.prototype.writeFile = function (path, data, encoding) {
    const self = this;

    return new Promise((resolve, reject) => {
        self.fs.writeFile(path, data, encoding, (err) => {
            if (err) {
                return reject(err);
            } else {
                resolve();
            }
        });
    });
};

FileSystemManager.prototype.getUserConfFilePath = function () {
    const appDataDir = this.getDatabaseDirPath();
    return `${appDataDir}/conf.json`;
};

FileSystemManager.prototype.readdir = function (path, cb) {
    const self = this;

    return new Promise((resolve, reject) => {
        self.fs.readdir(path, (err, entries) => {
            if (err) {
                reject(err);
            } else {
                resolve(entries);
            }
        });
    });
};

FileSystemManager.prototype.nwMoveFile = function (oldPath, newPath) {
    const self = this;

    return new Promise((resolve, reject) => {
        const read = self.fs.createReadStream(oldPath);
        const write = self.fs.createWriteStream(newPath);

        read.pipe(write);
        read.on('end', () => {
            self.fs.unlink(oldPath, function(err) {
                if(err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    });
};

FileSystemManager.prototype.nwUnlink = function (path) {
    const self = this;

    return new Promise((resolve, reject) => {
        self.fs.unlink(path, function(err) {
            if(err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

FileSystemManager.prototype.nwRmDir = function (path) {
    const self = this;

    return new Promise((resolve, reject) => {
        self.fs.rmdir(path, function(err) {
            if(err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

FileSystemManager.prototype.nwExistsSync = function (path) {
    return this.fs.existsSync(path);
};


FileSystemManager.prototype.getParentDirPath = function () {
    return false;
};

FileSystemManager.prototype.getDatabaseDirName = function () {
    return false;
};

FileSystemManager.prototype.getDatabaseDirPath = function () {
    return this.desktopApp.getAppDataDir();
};

FileSystemManager.prototype.getAppDataDir = function() {
    return this.desktopApp.getAppDataDir();
}

FileSystemManager.prototype.getDefaultEncoding = function () {
    return 'utf8';
};

module.exports = FileSystemManager;
