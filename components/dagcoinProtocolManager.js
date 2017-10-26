'use strict';

// My module
function DagcoinProtocolManager () {
	this.device = require('byteballcore/device');
    this.timedPromises = require('./promiseManager');

    this.messageCounter = 0;
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

    if (messageId == null) {
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

		self.device.sendMessageToDevice(deviceAddress, 'text', JSON.stringify(message), {
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

    console.log(`SENDING MESSAGE WITH ID: ${messageId}`);

    const listeningPromise = self.timedPromises.listeningTimedPromise(
    	`dagcoin.response.${subject}`,
		(message, fromAddress) => {
    		console.log(`CONDITION WITH ${JSON.stringify(message)} ID: ${messageId} FROM ${fromAddress}`);
    		if (fromAddress !== deviceAddress) {
    			console.log(`INCOMPATIBLE DEVICE ADDRESSES: ${fromAddress} : ${deviceAddress}`);
    			return null;
			}

			if (message.id !== messageId) {
                console.log(`INCOMPATIBLE MESSAGE IDs: ${message.id} : ${messageId}`);
    			return null;
			}

			if (message.messageBody.error) {
                console.log(`ERROR DETECTED: ${message.messageBody.error}`);
    			throw Error(message.messageBody.error);
			}

			if (!message.messageBody.proofs || message.messageBody.proofs.length == 0) {
                console.log(`NO PROOFS PROVIDED`);
                return null;
			}

			console.log(`RETURNING ${JSON.stringify(message.messageBody.proofs)}`);

			return message.messageBody.proofs;
		},
		30 * 1000,
		`DID NOT RECEIVE A REPLY FOR ${JSON.stringify(messageBody)}`
	);

    console.log(`SENDING REQUEST ${subject} TO ${deviceAddress}`);

    return this.sendMessage(deviceAddress, 'request', subject, messageBody, messageId).then(() => {
        console.log(`LISTENING ${subject} FROM ${deviceAddress}`);

    	return listeningPromise;
	});
};

module.exports = DagcoinProtocolManager;