'use strict';

// My module
function DagcoinProtocolManager () {
	this.device = require('byteballcore/device');
    this.timedPromises = require('./promiseManager');
}

DagcoinProtocolManager.prototype.nextMessageId = function () {
    const id = this.messageCounter;
    this.messageCounter += 1;
    return id;
};

DagcoinProtocolManager.prototype.sendMessage = function (deviceAddress, messageType, subject, messageBody, messageId) {
    if (!deviceAddress) {
        throw Error('PARAMETER deviceAddress UNSPECIFIED');
    }

    if (!messageType) {
        throw Error('PARAMETER messageType UNSPECIFIED');
    }

    if (!subject) {
        throw Error('PARAMETER subject UNSPECIFIED');
    }

    const self = this;

    if (!messageId) {
        messageId = this.nextMessageId();
    }

	return new Promise((resolve, reject) => {
		const message = {
			protocol: 'dagcoin',
			title: `${messageType}.${subject}`,
			id: messageId,
			messageType,
			messageBody
		};

		self.device.sendMessageToDevice(correspondent.device_address, 'text', JSON.stringify(message), {
			ifOk() {
				resolve(message.id);
			},
			ifError(error) {
				reject(error);
			}
		});
	});
};

DagcoinProtocolManager.prototype.sendRequest = function (deviceAddress, subject, messageBody, messageId) {
    return this.sendMessage(deviceAddress, 'request', subject, messageBody, messageId);
};

DagcoinProtocolManager.prototype.sendResponse = function (deviceAddress, subject, messageBody, messageId) {
    return this.sendMessage(deviceAddress, 'response', subject, messageBody, messageId);
};

DagcoinProtocolManager.prototype.sendRequestAndListen = function (deviceAddress, subject, messageBody) {
	const self = this;

    const messageId = self.nextMessageId();

    const listeningPromise = self.timedPromises.listeningTimedPromise(
    	`dagcoin.response.${subject}`,
		(message, fromAddress) => {
    		if (fromAddress !== deviceAddress) {
    			return null;
			}

			if (message.id !== messageId) {
    			return null;
			}

			return messageBody.proofs;
		},
		30 * 1000,
		`DID NOT RECEIVE A REPLY FOR ${JSON.stringify(messageBody)}`
	);

    return this.sendMessage(deviceAddress, 'request', subject, messageBody, messageId).then(() => {
    	return listeningPromise;
	});
};

module.exports = DagcoinProtocolManager;