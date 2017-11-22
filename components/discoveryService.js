'use strict';
function DiscoveryService() {
    this.deviceManager = require('dagcoin-core/lib/deviceManager').getInstance();

    this.conf = require('byteballcore/conf.js');
    this.discoveryServicePairingCode = this.conf.discoveryServicePairingCode;
    this.eventBus = require('byteballcore/event_bus.js');
    this.device = require('byteballcore/device.js');
    this.db = require('byteballcore/db.js');
}

DiscoveryService.prototype.messages = {
    startingTheBusiness: 'STARTING_THE_BUSINESS',
    aliveAndWell: 'ALIVE_AND_WELL',
    temporarilyUnavailable: 'TEMPORARILY_UNAVAILABLE',
    outOfBusiness: 'OUT_OF_BUSINESS',
    listTraders: 'LIST_TRADERS',
    updateSettings: 'UPDATE_SETTINGS'
};

DiscoveryService.prototype.init = function () {
    const self = this;

    return self.deviceManager.makeSureDeviceIsConnected(this.discoveryServicePairingCode).then((deviceAddress) => {
        self.discoveryServiceDeviceAddress = deviceAddress;
        return Promise.resolve();
    });
};

DiscoveryService.prototype.startingTheBusiness = function (pairCode) {
    return this.deviceManager.sendRequestAndListen(this.discoveryServiceDeviceAddress, this.messages.startingTheBusiness, { pairCode });
};

DiscoveryService.prototype.aliveAndWell = function (pairCode) {
    return this.deviceManager.sendRequestAndListen(this.discoveryServiceDeviceAddress, this.messages.aliveAndWell, { pairCode });
};

DiscoveryService.prototype.updateSettings = function (settings) {
    return this.deviceManager.sendRequestAndListen(this.discoveryServiceDeviceAddress, this.messages.updateSettings, { settings });
};

DiscoveryService.prototype.outOfBusiness = function () {
    return this.deviceManager.sendRequestAndListen(this.discoveryServiceDeviceAddress, this.messages.outOfBusiness, {});
};

module.exports = DiscoveryService;