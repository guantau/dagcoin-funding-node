'use strict';
function DiscoveryService() {
    const FileSystem = require('./fileSystemManager');

    this.conf = require('byteballcore/conf.js');
    this.discoveryServicePairingCode = this.conf.discoveryServicePairingCode;
    this.eventBus = require('byteballcore/event_bus.js');
    this.device = require('byteballcore/device.js');
    this.db = require('byteballcore/db.js');
    this.discoveryServiceAddresses = [];
    this.discoveryServiceAvailabilityCheckingPromise = null;
    this.fs = new FileSystem();
}

DiscoveryService.prototype.messages = {
    startingTheBusiness: 'STARTING_THE_BUSINESS',
    aliveAndWell: 'ALIVE_AND_WELL',
    temporarilyUnavailable: 'TEMPORARILY_UNAVAILABLE',
    outOfBusiness: 'OUT_OF_BUSINESS',
    listTraders: 'LIST_TRADERS',
    updateSettings: 'UPDATE_SETTINGS'
};

/**
 * Ensures the discovery service is connected and responsive.
 */
DiscoveryService.prototype.makeSureDiscoveryServiceIsConnected = function () {
    const self = this;

    return this.checkOrPairDevice(this.discoveryServicePairingCode)
        .then((correspondent) => {
            console.log(`RECEIVED A CORRESPONDENT: ${JSON.stringify(correspondent)}`);

            const discoveryServiceDeviceAddress = correspondent.device_address;

            self.discoveryServiceDeviceAddress = discoveryServiceDeviceAddress;

            if (this.discoveryServiceAddresses.indexOf(discoveryServiceDeviceAddress) < 0) {
                console.log(`PUSHING THE DISCOVERY SERVICE ADDRESS (${this.discoveryServiceAddresses}) INTO THE INTERNAL DATA STRUCTURE`);
                this.discoveryServiceAddresses.push(discoveryServiceDeviceAddress);
            }

            console.log(`THE DISCOVERY SERVICE ADDRESS ARRAY ALREADY CONTAINS: ${discoveryServiceDeviceAddress}`);

            if (this.discoveryServiceAvailabilityCheckingPromise !== null) {
                console.log('ALREADY QUERIED THE DISCOVERY SERVICE. RETURNING THE WAITING PROMISE ...');
                return this.discoveryServiceAvailabilityCheckingPromise;
            }

            const promise = new Promise((resolve) => {
                const listener = function (message, fromAddress) {
                    if (fromAddress === discoveryServiceDeviceAddress) {
                        console.log(`THE DISCOVERY SERVICE (${discoveryServiceDeviceAddress}) IS ALIVE`);
                        self.eventBus.removeListener('dagcoin.connected', listener);
                        resolve(correspondent);
                    }
                };

                this.eventBus.on('dagcoin.connected', listener);
            });

            const keepAlive = {
                protocol: 'dagcoin',
                title: 'is-connected'
            };

            console.log('SENDING A KEEPALIVE MESSAGE TO THE DISOVERY SERVICE');

            try {
                this.device.sendMessageToDevice(discoveryServiceDeviceAddress, 'text', JSON.stringify(keepAlive));
            } catch (e) {
                console.log(`EXCEPTION WHILE SENDIN A MESSAGE TO DEVICE ${fromAddress}: ${e}`);
            }

            const attempts = 12;

            const timeoutMessage = `THE DISCOVERY SERVICE ${discoveryServiceDeviceAddress} DID NOT REPLY AFTER 10 SECONDS`;
            const finalTimeoutMessage = `THE DISCOVERY SERVICE DID NOT REPLY AFTER ${attempts} ATTEMPS`;

            const timeoutMessages = {timeoutMessage, finalTimeoutMessage};

            this.discoveryServiceAvailabilityCheckingPromise = require('./promiseManager').repeatedTimedPromise(promise, 10000, attempts, timeoutMessages);

            // After ten minutes will be needed to make sure the discovery service is connected
            setTimeout(() => {
                this.discoveryServiceAvailabilityCheckingPromise = null;
            }, 10 * 60 * 1000);

            return this.discoveryServiceAvailabilityCheckingPromise;
        });
};

DiscoveryService.prototype.lookupDeviceByPublicKey = function (pubkey) {
    return new Promise((resolve) => {
        this.db.query('SELECT device_address FROM correspondent_devices WHERE pubkey = ? AND is_confirmed = 1', [pubkey], (rows) => {
            if (rows.length === 0) {
                console.log(`DEVICE WITH PUBKEY ${pubkey} NOT YET PAIRED`);
                resolve(null);
            } else {
                const deviceAddress = rows[0].device_address;
                console.log(`DEVICE WITH PUBKEY ${pubkey} ALREADY PAIRED: ${deviceAddress}`);
                resolve(deviceAddress);
            }
        });
    });
};

DiscoveryService.prototype.pairDevice = function (pubkey, hub, pairingSecret) {
    return new Promise((resolve) => {
        this.device.addUnconfirmedCorrespondent(pubkey, hub, 'New', (deviceAddress) => {
            console.log(`PAIRING WITH ${deviceAddress} ... ADD UNCONFIRMED CORRESPONDENT`);
            this.discoveryServiceAddresses.push(deviceAddress);
            resolve(deviceAddress);
        });
    }).then((deviceAddress) => {
        console.log(`PAIRING WITH ${deviceAddress} ... ADD UNCONFIRMED CORRESPONDENT WAITING FOR PAIRING`);
        return new Promise((resolve) => {
            this.device.startWaitingForPairing((reversePairingInfo) => {
                resolve({
                    deviceAddress,
                    reversePairingInfo
                });
            });
        });
    }).then((params) => {
        return new Promise((resolve, reject) => {
            console.log(`PAIRING WITH ${params.deviceAddress} ... SENDING PAIRING MESSAGE`);

            this.device.sendPairingMessage(
                hub,
                pubkey,
                pairingSecret,
                params.reversePairingInfo.pairing_secret,
                {
                    ifOk: () => {
                        resolve(params.deviceAddress);
                    },
                    ifError: () => {
                        reject('FAILED DELIVERING THE PAIRING MESSAGE');
                    }
                }
            );
        });
    }).then((deviceAddress) => {
        console.log(`LOOKING UP CORRESPONDENT WITH DEVICE ADDRESS ${deviceAddress}`);
        return this.getCorrespondent(deviceAddress);
    });
};

DiscoveryService.prototype.getCorrespondent = function (deviceAddress) {
    console.log(`GETTING CORRESPONDENT FROM DB WITH DEVICE ADDRESS ${deviceAddress}`);
    return new Promise((resolve) => {
        this.device.readCorrespondent(deviceAddress, (cor) => {
            resolve(cor);
        });
    });
};

DiscoveryService.prototype.checkOrPairDevice = function(pairCode) {
    const matches = pairCode.match(/^([\w\/+]+)@([\w.:\/-]+)#([\w\/+-]+)$/);
    const pubkey = matches[1];
    const hub = matches[2];
    const pairingSecret = matches[3];

    return this.lookupDeviceByPublicKey(pubkey).then((deviceAddress) => {
        if (deviceAddress === null) {
            return this.pairDevice(pubkey, hub, pairingSecret);
        }

        return this.getCorrespondent(deviceAddress);
    });
};

DiscoveryService.prototype.listenToMessage = function (messageType, messageId) {
    const self = this;

    const promise = new Promise((resolve) => {
        self.eventBus.once(`received.${messageId}`, resolve);
    });

    const listener = function (message) {
        if (message.id !== messageId) {
            console.log(`WAS WAITING FOR ${messageId}, HEARD OF ${message.id}`);
            return;
        }

        self.eventBus.emit(`received.${messageId}`, message);
    };

    self.eventBus.on(`dagcoin.response.${messageType}`, listener);

    const TimeOutInSeconds = 120;

    return require('./promiseManager')
        .timedPromise(promise, TimeOutInSeconds * 1000, `DID NOT RECEIVE A REPLY FOR MESSAGE ${messageId} WITHIN ${TimeOutInSeconds} SECONDS`)
        .then(
            (message) => {
                console.log(`MESSAGE RECEIVED: ${JSON.stringify(message)}`);
                self.eventBus.removeListener(`dagcoin.response.${messageType}`, listener);
                return Promise.resolve(message)
            },
            (err) => {
                console.log(`SOMETHING WRONG HAPPENED: ${err}`);
                self.eventBus.removeListener(`dagcoin.response.${messageType}`, listener);
                return Promise.reject(err);
            }
        );
};

DiscoveryService.prototype.sendMessage = function (message) {
    console.log(`SENDING A ${message.messageType} MESSAGE TO THE DISCOVERY SERVICE`);

    const self = this;

    const messageString = JSON.stringify(message);
    const messageId = this.hashCode(messageString);
    message.id = messageId;

    return this.makeSureDiscoveryServiceIsConnected().then(() => {
        return new Promise((resolve, reject) => {
            this.device.sendMessageToDevice(
                self.discoveryServiceDeviceAddress,
                'text',
                JSON.stringify(message),
                {
                    onSaved: function () {
                        console.log(`A ${message.messageType} MESSAGE WAS SAVED INTO THE DATABASE`);
                    },
                    ifOk: function () {
                        resolve();
                    },
                    ifError: function (err) {
                        reject(`COULD NOT DELIVER A ${message.messageType} MESSAGE. REASON: ${err}`)
                    }
                }
            );
        });
    });
};

DiscoveryService.prototype.sendMessageAndListen = function (message) {
    console.log(`SENDING A ${message.messageType} MESSAGE TO THE DISCOVERY SERVICE`);

    const self = this;

    const messageString = JSON.stringify(message);
    const messageId = this.hashCode(messageString + new Date());
    message.id = messageId;

    const listeningPromise = this.listenToMessage(message.messageType, messageId);

    this.makeSureDiscoveryServiceIsConnected().then(() => {
        return new Promise((resolve, reject) => {
            this.device.sendMessageToDevice (
                self.discoveryServiceDeviceAddress,
                'text',
                JSON.stringify(message),
                {
                    onSaved: function () {
                        console.log(`A ${message.messageType} MESSAGE WAS SAVED INTO THE DATABASE`);
                    },
                    ifOk: function () {
                        resolve();
                    },
                    ifError: function (err) {
                        reject(`COULD NOT DELIVER A ${message.messageType} MESSAGE. REASON: ${err}`)
                    }
                }
            );
        });
    });

    return listeningPromise;
};

DiscoveryService.prototype.startingTheBusiness = function (pairCode) {
    const message = {
        protocol: 'dagcoin',
        title: `request.${this.messages.startingTheBusiness}`,
        messageType: this.messages.startingTheBusiness
    };

    if (pairCode) {
        message.messageBody = {
            pairCode
        }
    }

    return this.sendMessageAndListen(message);
};

DiscoveryService.prototype.aliveAndWell = function (pairCode) {
    const message = {
        protocol: 'dagcoin',
        title: `request.${this.messages.aliveAndWell}`,
        messageType: this.messages.aliveAndWell
    };

    if (pairCode) {
        message.messageBody = {
            pairCode
        }
    }

    return this.sendMessageAndListen(message);
};

DiscoveryService.prototype.updateSettings = function (settings) {
    const message = {
        protocol: 'dagcoin',
        title: `request.${this.messages.updateSettings}`,
        messageType: this.messages.updateSettings
    };

    if (settings) {
        message.messageBody = {
            settings
        }
    }

    return this.sendMessageAndListen(message);
};

DiscoveryService.prototype.outOfBusiness = function () {
    const message = {
        protocol: 'dagcoin',
        title: `request.${this.messages.outOfBusiness}`,
        messageType: this.messages.outOfBusiness
    };

    return this.sendMessageAndListen(message);
};

DiscoveryService.prototype.hashCode = function(string) {
    var hash = 0, i, chr;

    if (string.length === 0) {
        return hash;
    }

    for (i = 0; i < string.length; i++) {
        chr   = string.charCodeAt(i);
        hash  = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }

    return hash;
};

module.exports = DiscoveryService;