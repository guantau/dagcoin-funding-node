'use strict';

// My module
function AccountManager () {
	this.conf = require('byteballcore/conf.js');
	this.fs = require('fs');
	this.crypto = require('crypto');
	this.desktopApp = require('byteballcore/desktop_app.js');
	this.device = require('byteballcore/device.js');
	this.db = require('byteballcore/db.js');
	this.eventBus = require('byteballcore/event_bus');
	this.util = require('util');
	this.network = require('byteballcore/network');
	this.consolidation = require('./consolidation');
    this.composer = require('byteballcore/composer.js');

	this.applicationDataDirectory = this.desktopApp.getAppDataDir();

	const ConfManager = require('./confManager');
	this.confManager = new ConfManager();

	const KeyManager = require('./keyManager');
	this.keyManager = new KeyManager();

	const WalletManager = require('./walletManager');
	this.walletManager = new WalletManager();

	this.Signer = require('./signer');
	this.Mnemonic = require('bitcore-mnemonic');

	this.passPhrase = this.conf.passPhrase;
}

AccountManager.prototype.createAccount = function () {
	console.log('COULD NOT READ THE KEY FILE, IT NEEDS TO BE GENERATED');
	const suggestedDeviceName = require('os').hostname() || 'Headless';

	let deviceName = this.conf.deviceName;

	if (!deviceName) {
		deviceName = suggestedDeviceName;
	}

	const self = this;

	let mnemonic = new self.Mnemonic(); // generates new mnemonic
	while (!self.Mnemonic.isValid(mnemonic.toString())){
		mnemonic = new self.Mnemonic();
	}

	return this.confManager.write({deviceName: deviceName}).then(() => {
		self.deviceTempPrivKey = self.crypto.randomBytes(32);
		self.devicePrevTempPrivKey = self.crypto.randomBytes(32);
		self.mnemonicPhrase = mnemonic.phrase;

		self.keys = {
			mnemonic_phrase: self.mnemonicPhrase,
			temp_priv_key: self.deviceTempPrivKey.toString('base64'),
			prev_temp_priv_key: self.devicePrevTempPrivKey.toString('base64')
		};

		return self.keyManager.write(self.keys);
	}).then((keys) => {
		console.log('KEYS CREATED');
		self.xPrivKey = mnemonic.toHDPrivateKey(self.passPhrase);
		self.signer = new self.Signer(self.xPrivKey);

		console.log('SIGNER CREATED');
		return self.walletManager.create(self.xPrivKey).then(() => {
			console.log('RETURNING THE ACCOUNT');
			return Promise.resolve(self);
		});
	});
};

AccountManager.prototype.getSigner = function () {
	return this.signer;
};

AccountManager.prototype.getKeys = function () {
	return this.keys;
};

AccountManager.prototype.getPassPhrase = function () {
	return this.passPhrase;
};

AccountManager.prototype.getPrivateKey = function () {
	return this.xPrivKey;
};

AccountManager.prototype.getPairingCode = function () {
    return this.pairigCode;
};

AccountManager.prototype.replaceConsoleLog = function () {
	const self = this;

	var log_filename = self.conf.LOG_FILENAME || (`${self.applicationDataDirectory}/log.txt`);
	var writeStream = self.fs.createWriteStream(log_filename);

	console.log('---------------');
	console.log('From this point, output will be redirected to '+log_filename);
	console.log("To release the terminal, type Ctrl-Z, then 'bg'");
	console.log = function(){
		writeStream.write(Date().toString()+': ');
		writeStream.write(self.util.format.apply(null, arguments) + '\n');
	};
	console.warn = console.log;
	console.info = console.log;
}

AccountManager.prototype.readAccount = function () {
	const self = this;

	console.log('-----------------------');

	if (self.conf.control_addresses) {
		console.log(`REMOTE ACCESS ALLOWED FROM DEVICES: ${self.conf.control_addresses.join(', ')}`);
	}

	if (self.conf.payout_address) {
		console.log(`PAYOUTS ALLOWED TO DEVICED: ${self.conf.payout_address}`);
	}

	console.log('-----------------------');

	return self.keyManager.read().then(
		(data) => {
			self.keys = JSON.parse(data);

			var mnemonic = new self.Mnemonic(self.keys.mnemonic_phrase);
			self.xPrivKey = mnemonic.toHDPrivateKey(self.passPhrase);
			self.signer = new self.Signer(self.xPrivKey);

			return self.walletManager.exists().then((doesExist) => {
				if(doesExist) {
					return Promise.resolve(self);
				} else {
					return self.walletManager.create(self.xPrivKey).then(() => {
						return Promise.resolve(self);
					});
				}
			});
		},
		() => {
			return self.createAccount();
		}
	).then((account) => {
		if(!account) {
			return Promise.reject('THE ACCOUNT COULD NOT BE RETRIEVED OR CREATED');
		}

		return self.walletManager.getSingle();
	}).then((walletId) => {
		console.log('PRIVATE KEY: ' + JSON.stringify(self.getPrivateKey()));
		console.log('OTHER KEYS: ' + JSON.stringify(self.getKeys()));

		self.walletId = walletId;

		var devicePrivKey = self.getPrivateKey().derive("m/1'").privateKey.bn.toBuffer({size:32});
		self.device.setDevicePrivateKey(devicePrivKey);
		self.myDeviceAddress = self.device.getMyDeviceAddress();

		return new Promise((resolve, reject) => {
			self.db.query("SELECT 1 FROM extended_pubkeys WHERE device_address=?", [self.myDeviceAddress], function(rows) {
				if (rows.length > 1) {
					reject("MORE THAN ONE extended_pubkey?!?");
				} else if (rows.length === 0) {
					setTimeout(function () {
						reject('THE PASSPHRASE IS INCORRECT');
					}, 1000);
				} else {
					resolve();
				}
			});
		});
	}).then(() => {
		require('byteballcore/wallet.js'); // we don't need any of its functions but it listens for hubmessages

		const keys = self.getKeys();

		const mnemonic_phrase = keys.mnemonic_phrase;
		const deviceTempPrivKey = Buffer(keys.temp_priv_key, 'base64');
		const devicePrevTempPrivKey = Buffer(keys.prev_temp_priv_key, 'base64');

		var saveTempKeys = function(new_temp_key, new_prev_temp_key, onDone){
			var processedKeys = {
				mnemonic_phrase: mnemonic_phrase,
				temp_priv_key: deviceTempPrivKey.toString('base64'),
				prev_temp_priv_key: devicePrevTempPrivKey.toString('base64')
			};
			self.keyManager.write(processedKeys).then(() => onDone);
		};

		self.device.setTempKeys(deviceTempPrivKey, devicePrevTempPrivKey, saveTempKeys);
		self.device.setDeviceName(self.conf.deviceName);
		self.device.setDeviceHub(self.conf.hub);

		self.myDevicePubkey = self.device.getMyDevicePubKey();
		console.log(`====== my device address: ${self.myDeviceAddress}`);
		console.log(`====== my device pubkey: ${self.myDevicePubkey}`);

		if (self.conf.permanent_pairing_secret){
			self.pairigCode = `${self.myDevicePubkey}@${self.conf.hub}#${self.conf.permanent_pairing_secret}`;
			console.log(`====== my pairing code: ${self.pairigCode}`);
		}

		if (self.conf.bLight){
			var light_wallet = require('byteballcore/light_wallet.js');
			light_wallet.setLightVendorHost(self.conf.hub);
		}

		if (self.conf.MAX_UNSPENT_OUTPUTS && self.conf.CONSOLIDATION_INTERVAL){
			const consolidate = () => {
				if (!self.network.isCatchingUp()) {
					self.consolidation.consolidate(self.walletId, self.getSigner());
				}
			}
			setInterval(consolidate, self.conf.CONSOLIDATION_INTERVAL);
			setTimeout(consolidate, 300*1000);
		}

		return new Promise((resolve) => {
			//LISTENS FOR UPDATES FOR 2 SECONDS BEFORE DOING ANYTHING
			setTimeout(function () {
				console.log('ACCOUNT READY');
				resolve();
			}, 2000);
		});
	});
};

AccountManager.prototype.sendPayment = function (toAddress, amount) {
    const self = this;

    const signer = self.getSigner();

    if(!signer) {
        return Promise.reject('THE SIGNER IS NOT DEFINED. USE THIS METHOD ONLY AFTER LOADING THE ACCOUNT WITH readAccount');
    }

    return self.walletManager.readSingleAddress().then((fromAddress) => {
        return new Promise((resolve, reject) => {
            const onError = (err) => {
                reject(`COULD NOT DELIVER ${amount} BYTES TO ${toAddress} BECAUSE: ${err}`);
            };

            const callbacks = self.composer.getSavingCallbacks({
                ifNotEnoughFunds: onError,
                ifError: onError,
                ifOk: function(objJoint){
                    self.network.broadcastJoint(objJoint);
                    resolve(objJoint);
                }
            });

            // i.e.: "LS3PUAGJ2CEYBKWPODVV72D3IWWBXNXO"
            var payee_address = toAddress;
            var arrOutputs = [
                {address: fromAddress, amount: 0},      // the change
                {address: payee_address, amount: amount}  // the receiver
            ];

            self.composer.composePaymentJoint([fromAddress], arrOutputs, signer, callbacks);
        });
    });
};

AccountManager.prototype.sendPaymentOrWait = function (toAddress, amount) {
	const self = this;

	if (self.paymentOngoing) {
		return self.paymentWaitingPromise.then();
	}

	self.paymentOngoing = true;

	return this.sendPayment(toAddress, amount).then((result) => {
        self.paymentWaitingPromise = new Promise((resolve) => {
            setTimeout(resolve, 30 * 1000);
		});

        return Promise.resolve(result);
	});
};

/**
 * Takes all bytes from a shared address and sends them to the main address. It works only if the definition of the shared address
 * allows full controls to the funding main address (shared address defined since October, 10th).
 *
 * The following definition allows BCS55XCV5RIJWXJWVGFLDRMWKKXRUVCS to control the shared address.
 * ["or",[["address","BCS55XCV5RIJWXJWVGFLDRMWKKXRUVCS"],["and",[["address","BCS55XCV5RIJWXJWVGFLDRMWKKXRUVCS"],["address","4SQ5PP7Z7LYIDLOCXRPXXTR5M3K6L66I"]]]]]
 * @param toBeEmptiedAddress A shared address to be emptied.
 * @returns {*} A promise containing the generated payment joint or the rejection reason.
 */
AccountManager.prototype.emptySharedAddress = function (toBeEmptiedAddress) {
    const self = this;

    const signer = self.getSigner();

    if(!signer) {
        return Promise.reject('THE SIGNER IS NOT DEFINED. USE THIS METHOD ONLY AFTER LOADING THE ACCOUNT WITH readAccount');
    }

    return self.walletManager.readSingleAddress().then((toAddress) => {
        return new Promise((resolve, reject) => {
            const onError = (err) => {
                reject(`COULD NOT DELIVER ${amount} BYTES TO ${toAddress} BECAUSE: ${err}`);
            };

            const callbacks = self.composer.getSavingCallbacks({
                ifNotEnoughFunds: onError,
                ifError: onError,
                ifOk: function(objJoint){
                    self.network.broadcastJoint(objJoint);
                    resolve(objJoint);
                }
            });

            var arrOutputs = [
                {address: toAddress, amount: 0}  // the receiver
            ];

            self.composer.composeJoint({
				send_all: true,
				paying_addresses: [toBeEmptiedAddress],
                shared_addresses: [toBeEmptiedAddress],
				outputs: arrOutputs,
				signer: signer,
				callbacks: callbacks
            });
        });
    });
}

module.exports = AccountManager;