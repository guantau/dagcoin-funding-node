/*jslint node: true */
"use strict";

const accountManager = require('dagcoin-core/lib/accountManager').getInstance();
const configurationManager = require('dagcoin-core/lib/confManager').getInstance();
const WalletManager = require('dagcoin-core/lib/walletManager');
const walletManager = new WalletManager();
const exManager = require('dagcoin-core/lib/exceptionManager');
const osManager = require('dagcoin-core/lib/operatingSystemManager').getInstance();

let raiserConfig = {};
configurationManager.addConfigSource({
    name: 'system-env',
    get: key => Promise.resolve(process.env[`DAGCOIN_FUNDING_${key}`])
})
.then(() => accountManager.readAccount())
.then(() => walletManager.readSingleAddress())
.then((address) => {
	raiserConfig.address = address;

    return configurationManager.getMultiple(['BYTEBALL_FAUCET', 'FAUCET_PAIRING_CODE']);
}).then((conf) => {
    const device = require('byteballcore/device.js');

    console.log('sending message to faucet');
    handleCode(conf.FAUCET_PAIRING_CODE, device);

	return new Promise((resolve, reject) => {
        device.sendMessageToDevice(conf.BYTEBALL_FAUCET, "text", raiserConfig.address, {
            ifOk: function(){
            	console.log('DONE ASKING BYTES');
                resolve();
            },
            ifError: function(error){
                if (typeof error == 'string') {
                	reject(new Error(error));
				} else {
                    reject(error);
				}
            }
        });
	});
}).catch((e) => {
    console.log('ERROR ASKING BYTES');
	exManager.logError(e);

	return Promise.resolve();
}).then(() => {
	setTimeout(() => {
        osManager.shutDown();
	}, 5000);
});

function handleCode(code, device){
	var conf = require('byteballcore/conf.js');
	var re = new RegExp('^'+conf.program+':', 'i');
	code = code.replace(re, '');
	var matches = code.match(/^([\w\/+]+)@([\w.:\/-]+)#([\w\/+-]+)$/);
	if (!matches)
		return setError("Invalid pairing code");
	var pubkey = matches[1];
	var hub = matches[2];
	var pairing_secret = matches[3];
	if (pubkey.length !== 44)
		return setError("Invalid pubkey length");
	console.log(pubkey, hub, pairing_secret);
	acceptInvitation(hub, pubkey, pairing_secret, device, function(err){
		if (err) {
			console.log(err);
		}
	});
}

function acceptInvitation(hub_host, device_pubkey, pairing_secret, device, cb){
	if (device_pubkey === device.getMyDevicePubKey())
		return cb("cannot pair with myself");
	if (!device.isValidPubKey(device_pubkey))
		return cb("invalid peer public key");
	// the correspondent will be initially called 'New', we'll rename it as soon as we receive the reverse pairing secret back
	device.addUnconfirmedCorrespondent(device_pubkey, hub_host, 'New', function(device_address){
		device.startWaitingForPairing(function(reversePairingInfo){
			device.sendPairingMessage(hub_host, device_pubkey, pairing_secret, reversePairingInfo.pairing_secret, {
				ifOk: cb,
				ifError: cb
			});
		});
	});
};
