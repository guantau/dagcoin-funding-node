function FundingExchangeProvider (pairingString) {
    this.conf = require('byteballcore/conf.js');

    this.exchangeFee = this.conf.exchangeFee;
    this.totalBytes = this.conf.totalBytes;
    this.bytesPerAddress = this.conf.bytesPerAddress;
    this.maxEndUserCapacity = this.conf.maxEndUserCapacity;

    this.active = false;
    this.pairingString = pairingString;

    const DiscoveryService = require('./discoveryService');
    this.discoveryService = new DiscoveryService();
}

FundingExchangeProvider.prototype.activate = function () {
    if (this.active) {
        return Promise.resolve();
    }

    const self = this;

    return this.discoveryService.startingTheBusiness(this.pairingString)
    .then((response) => {
        if (response) {
            self.active = true;
            console.log(`RECEIVED A RESPONSE FOR ${self.discoveryService.messages.startingTheBusiness}: ${JSON.stringify(response)}`);
            self.keepAlive();
            return Promise.resolve();
        } else {
            console.log('NO REPLY FROM THE DISCOVERY SERVICE. CAN\'T BE SURE WHETHER IT ACCEPTED MY PROPOSAL.');
            return Promise.reject();
        }
    });
}

FundingExchangeProvider.prototype.updateSettings = function () {
    const settings = {
        exchangeFee: this.exchangeFee,
        totalBytes: this.totalBytes,
        bytesPerAddress: this.bytesPerAddress,
        maxEndUserCapacity: this.maxEndUserCapacity
    };

    this.discoveryService.updateSettings(settings).then((response) => {
        if (response) {
            console.log(`RECEIVED A RESPONSE FOR ${response.messageType}: ${JSON.stringify(response)}`);
            return Promise.resolve();
        } else {
            console.log('NO REPLY FROM THE DISCOVERY SERVICE. CAN\'T BE SURE WHETHER IT ACKNOWLEDGED MY CHANGE OF SETTINGS.');
            return Promise.reject();
        }
    });
};

FundingExchangeProvider.prototype.deactivate = function () {
    const self = this;

    this.discoveryService.outOfBusiness().then((response) => {
        if (response) {
            console.log(`RECEIVED A RESPONSE FOR ${response.messageType}: ${JSON.stringify(response)}`);
            self.active = false;
            return Promise.resolve();
        } else {
            console.log('NO REPLY FROM THE DISCOVERY SERVICE. CAN\'T BE SURE WHETHER IT ACCEPTED MY RESIGNATION FROM BEING A FUNDING NODE.');
            return Promise.reject();
        }
    });
};

FundingExchangeProvider.prototype.keepAlive = function () {
    if (!this.active) {
        return;
    }

    const self = this;

    this.discoveryService.aliveAndWell().then(() => {
        setTimeout(() => {
            self.keepAlive();
        }, 10 * 60 * 1000);
    });
}

module.exports = FundingExchangeProvider;