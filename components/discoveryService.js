'use strict';
function DiscoveryService() {
    this.deviceManager = require('dagcoin-core/deviceManager').getInstance();

    this.conf = require('byteballcore/conf.js');
    this.discoveryServicePairingCode = this.conf.discoveryServicePairingCode;
    this.eventBus = require('byteballcore/event_bus.js');
    this.device = require('byteballcore/device.js');
    this.db = require('byteballcore/db.js');
    this.discoveryServiceAddresses = [];
    this.discoveryServiceAvailabilityCheckingPromise = null;
}

DiscoveryService.prototype.messages = {
    startingTheBusiness: 'STARTING_THE_BUSINESS',
    aliveAndWell: 'ALIVE_AND_WELL',
    temporarilyUnavailable: 'TEMPORARILY_UNAVAILABLE',
    outOfBusiness: 'OUT_OF_BUSINESS',
    listTraders: 'LIST_TRADERS',
    updateSettings: 'UPDATE_SETTINGS'
};

DiscoveryService.prototype.sendMessageAndListen = function (subject, message) {
    console.log(`SENDING A ${message.title} MESSAGE TO THE DISCOVERY SERVICE`);

    const self = this;

    /* const messageString = JSON.stringify(message);
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

    return listeningPromise;*/
    return self.deviceManager.makeSureDeviceIsConnected(this.discoveryServicePairingCode).then((deviceAddress) => {
        self.discoveryServiceDeviceAddress = deviceAddress;
        return self.deviceManager.sendRequestAndListen(deviceAddress, subject, message);
    })
};

DiscoveryService.prototype.startingTheBusiness = function (pairCode) {
    return this.sendMessageAndListen(this.messages.startingTheBusiness, { pairCode });
};

DiscoveryService.prototype.aliveAndWell = function (pairCode) {
    let messageBody = {};

    if (pairCode) {
        messageBody.pairCode = pairCode;
    }

    return this.sendMessageAndListen(this.messages.aliveAndWell, messageBody);
};

DiscoveryService.prototype.updateSettings = function (settings) {
    let messageBody = {};

    if (settings) {
        messageBody.settings = settings;
    }

    return this.sendMessageAndListen(this.messages.updateSettings, messageBody);
};

DiscoveryService.prototype.outOfBusiness = function () {
    return this.sendMessageAndListen(this.messages.outOfBusiness, {});
};

module.exports = DiscoveryService;