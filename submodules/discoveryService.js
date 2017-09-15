// My module
function DiscoveryService(discoveryServicePairingCode) {
    const FileSystem = require('./fileSystem');

    this.discoveryServicePairingCode = discoveryServicePairingCode;
    this.eventBus = require('byteballcore/event_bus.js');
    this.device = require('byteballcore/device.js');
    this.objectHash = require('byteballcore/object_hash.js');
    this.db = require('byteballcore/db.js');
    this.discoveryServiceAddresses = [];
    this.discoveryServiceAvailabilityCheckingPromise = null;
    this.waitingForFundingAddress = false;
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

DiscoveryService.prototype.setIsWaitingForFundingAddress = function (value) {
    this.waitingForFundingAddress = value;
}

DiscoveryService.prototype.isWaitingForFundingAddress = function () {
    return this.waitingForFundingAddress;
}

DiscoveryService.prototype.isDiscoveryServiceAddress = function (deviceAddress) {
    return !!this.discoveryServiceAddresses.find(obj => obj === deviceAddress);
}

/**
 * Ensures the discovery service is connected and responsive.
 */
DiscoveryService.prototype.makeSureDiscoveryServiceIsConnected = function () {
    return this.checkOrPairDevice(this.discoveryServicePairingCode)
        .then((correspondent) => {
            console.log(`RECEIVED A CORRESPONDENT: ${JSON.stringify(correspondent)}`);

            const discoveryServiceDeviceAddress = correspondent.device_address;

            if (this.discoveryServiceAddresses.indexOf(discoveryServiceDeviceAddress) < 0) {
                console.log(`PUSHING THE DISCOVERY SERVICE ADDRESS (${this.discoveryServiceAddresses}) INTO THE INTERNAL DATA STRUCTURE`);
                this.discoveryServiceAddresses.push(discoveryServiceDeviceAddress);
            }

            console.log(`THE DISCOVERY SERVICE ADDRESS ARRAY ALREADY CONTAINS: ${discoveryServiceDeviceAddress}`);

            if (this.discoveryServiceAvailabilityCheckingPromise !== null) {
                console.log('ALREADY WAITING FOR THE DISCOVERY SERVICE TO REPLY');
                return this.discoveryServiceAvailabilityCheckingPromise;
            }

            const promise = new Promise((resolve) => {
                const listener = function (message, fromAddress) {
                    if (fromAddress === discoveryServiceDeviceAddress) {
                        console.log(`THE DISCOVERY SERVICE (${discoveryServiceDeviceAddress}) IS ALIVE`);
                        this.eventBus.removeListener('dagcoin.connected', listener);
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

            this.device.sendMessageToDevice(discoveryServiceDeviceAddress, 'text', JSON.stringify(keepAlive));

            const attempts = 12;

            const timeoutMessage = `THE DISCOVERY SERVICE ${discoveryServiceDeviceAddress} DID NOT REPLY AFTER 10 SECONDS`;
            const finalTimeoutMessage = `THE DISCOVERY SERVICE DID NOT REPLY AFTER ${attempts} ATTEMPS`;

            const timeoutMessages = {timeoutMessage, finalTimeoutMessage};

            this.discoveryServiceAvailabilityCheckingPromise = require('./timedPromises').repeatedTimedPromise(promise, 10000, attempts, timeoutMessages);

            // After ten minutes will be needed to make sure the discovery service is connected
            setTimeout(() => {
                this.discoveryServiceAvailabilityCheckingPromise = null;
            }, 10 * 60 * 1000);

            return this.discoveryServiceAvailabilityCheckingPromise;
        });
}

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
}

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
                params.reversePairingInfo.pairing_secret, {
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
}

DiscoveryService.prototype.getCorrespondent = function (deviceAddress) {
    console.log(`GETTING CORRESPONDENT FROM DB WITH DEVICE ADDRESS ${deviceAddress}`);
    return new Promise((resolve) => {
        this.device.readCorrespondent(deviceAddress, (cor) => {
            resolve(cor);
        });
    });
}

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
}

module.exports = DiscoveryService;