// My module
function FileSystem () {
    this.fs = require('fs');
    try {
        this.desktopApp = require('byteballcore/desktop_app.js');
    } catch (e) {
        // continue regardless of error
    }
}

FileSystem.prototype.readFile = function (path) {
    return new Promise((resolve, reject) => {
        this.fs.readFile(path, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
};

FileSystem.prototype.getPath = function (path) {
    return path.replace(/\\/g, '/');
};

FileSystem.prototype.writeFile = function (path, data, encoding) {
    return new Promise((resolve, reject) => {
        this.fs.writeFile(path, data, encoding, (err) => {
            if (err) {
                return reject(err);
            } else {
                resolve();
            }
        });
    });
};

FileSystem.prototype.getUserConfFilePath = function () {
    const appDataDir = this.getDatabaseDirPath();
    return `${appDataDir}/conf.json`;
};

FileSystem.prototype.readdir = function (path, cb) {
    return new Promise((resolve, reject) => {
        this.fs.readdir(path, (err, entries) => {
            if (err) {
                reject(err);
            } else {
                resolve(entries);
            }
        });
    });
};

FileSystem.prototype.nwMoveFile = function (oldPath, newPath) {
    return new Promise((resolve, reject) => {
        const read = this.fs.createReadStream(oldPath);
        const write = this.fs.createWriteStream(newPath);

        read.pipe(write);
        read.on('end', () => {
            this.fs.unlink(oldPath, function(err) {
                if(err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    });
};

FileSystem.prototype.nwUnlink = function (path) {
    return new Promise((resolve, reject) => {
        this.fs.unlink(path, function(err) {
            if(err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

FileSystem.prototype.nwRmDir = function (path) {
    return new Promise((resolve, reject) => {
        this.fs.rmdir(path, function(err) {
            if(err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

FileSystem.prototype.nwExistsSync = function (path) {
    return this.fs.existsSync(path);
};


FileSystem.prototype.getParentDirPath = function () {
    return false;
};

FileSystem.prototype.getDatabaseDirName = function () {
    return false;
};

FileSystem.prototype.getDatabaseDirPath = function () {
    return this.desktopApp.getAppDataDir();
};

module.exports = FileSystem;
