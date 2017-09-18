/*jslint node: true */
"use strict";
var fs = require('fs');
var crypto = require('crypto');
var util = require('util');
var conf = require('byteballcore/conf.js');
var desktopApp = require('byteballcore/desktop_app.js');
var db = require('byteballcore/db.js');
var eventBus = require('byteballcore/event_bus.js');

var Mnemonic = require('bitcore-mnemonic');
var Bitcore = require('bitcore-lib');

var appDataDir = desktopApp.getAppDataDir();
var KEYS_FILENAME = appDataDir + '/' + (conf.KEYS_FILENAME || 'keys.json');
var wallet_id;

let fundingExchangeProvider = null;

function replaceConsoleLog(){
	/* var log_filename = conf.LOG_FILENAME || (appDataDir + '/log.txt');
	var writeStream = fs.createWriteStream(log_filename);
	console.log('---------------');
	console.log('From this point, output will be redirected to '+log_filename);
	console.log("To release the terminal, type Ctrl-Z, then 'bg'");
	console.log = function(){
		writeStream.write(Date().toString()+': ');
		writeStream.write(util.format.apply(null, arguments) + '\n');
	};
	console.warn = console.log;
	console.info = console.log; */
}

function createConfigurationFile() {
    var userConfFile = appDataDir + '/conf.json';

    var deviceName = conf.deviceName || 'Dagcoin-Funding-Node';

    return new Promise((resolve, reject) => {
        fs.writeFile(userConfFile, JSON.stringify({deviceName: deviceName}, null, '\t'), 'utf8', function(err){
            if (err) {
                reject(`Failed to write the configuration file (conf.json). Reason: ${err}`);
            } else {
                resolve(true);
            }
        });
    });
}

function readKeyFile() {
    return new Promise((resolve, reject) => {
        fs.readFile(KEYS_FILENAME, 'utf8', function(err, data){
            if (err) { // first start
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

function readKeys() {
    const passPhrase = '123';

    console.log('-----------------------');

    if (conf.control_addresses) {
        console.log("remote access allowed from devices: " + conf.control_addresses.join(', '));
    }

    if (conf.payout_address) {
        console.log("payouts allowed to address: " + conf.payout_address);
    }

    console.log('-----------------------');

    let mnemonic = new Mnemonic(); // generates new mnemonic
    while (!Mnemonic.isValid(mnemonic.toString())) {
        mnemonic = new Mnemonic();
    }

	return readKeyFile().then(
        (data) => {
            return Promise.resolve(data);
        },
        (error) => { // first start
            console.log(`Failed to read keys, probably because this is the first start. Error reported, for reference: ${error}`);

            return createConfigurationFile().then(() => {
                var deviceTempPrivKey = crypto.randomBytes(32);
                var devicePrevTempPrivKey = crypto.randomBytes(32);

                return writeKeys(mnemonic.phrase, deviceTempPrivKey, devicePrevTempPrivKey);
            }).then(() => {
                console.log('keys created');

                return readKeyFile();
            });
        }
    ).then((data) => {
        console.log('keys available and read');

        var keys = JSON.parse(data);
        var deviceTempPrivKey = Buffer(keys.temp_priv_key, 'base64');
        var devicePrevTempPrivKey = Buffer(keys.prev_temp_priv_key, 'base64');

        return determineIfWalletExists().then((bWalletExists) => {
           if (bWalletExists) {
               console.log('Wallet found');
               return Promise.resolve({mnemonic_phrase: keys.mnemonic_phrase, passphrase: passPhrase, deviceTempPrivKey, devicePrevTempPrivKey});
           } else {
               console.log('Wallet not found. Creating one.');
               var xPrivKey = mnemonic.toHDPrivateKey(passPhrase);
               return createWalletAndIssueNewAddress(xPrivKey).then((addressInfo) => {
                   console.log(`New address issued: ${JSON.stringify(addressInfo)}`);
                   return Promise.resolve({mnemonic_phrase: keys.mnemonic_phrase, passphrase: passPhrase, deviceTempPrivKey, devicePrevTempPrivKey});
               });
           }
        });
    });
}

function writeKeys(mnemonic_phrase, deviceTempPrivKey, devicePrevTempPrivKey){
    return new Promise((resolve, reject) => {
        var keys = {
            mnemonic_phrase: mnemonic_phrase,
            temp_priv_key: deviceTempPrivKey.toString('base64'),
            prev_temp_priv_key: devicePrevTempPrivKey.toString('base64')
        };

        fs.writeFile(KEYS_FILENAME, JSON.stringify(keys, null, '\t'), 'utf8', function(err){
            if (err) {
                reject(`Failed to write keys file. Reason: ${err}`);
            } else {
                resolve(true);
            }
        });
    });
}

function createWalletAndIssueNewAddress(xPrivKey) {
    const walletDefinedByKeys = require('byteballcore/wallet_defined_by_keys.js');

    return new Promise((resolve, reject) => {
        console.log('Preparing data for creating a new wallet ...');
        var devicePrivKey = xPrivKey.derive("m/1'").privateKey.bn.toBuffer({size:32});
        var device = require('byteballcore/device.js');
        device.setDevicePrivateKey(devicePrivKey); // we need device address before creating a wallet
        var strXPubKey = Bitcore.HDPublicKey(xPrivKey.derive("m/44'/0'/0'")).toString();
        console.log('All ready for creating a new wallet.');
        walletDefinedByKeys.createWalletByDevices(strXPubKey, 0, 1, [], 'any walletName', function(walletId){
            if (walletId) {
                console.log(`Wallet created with id ${walletId}`);
                resolve(walletId);
            } else {
               reject('Wallet Id was not returned, meaning that it was not created. No reasons specified.');
            }
        });
    }).then((walletId) => {
        return new Promise((resolve, reject) => {
            walletDefinedByKeys.issueNextAddress(walletId, 0, function (addressInfo) {
                if (addressInfo) {
                    resolve(addressInfo);
                } else {
                    reject(`It was not possible to issue a new address for wallet with id ${walledId}`);
                }
            });
        });
    });
}

function isControlAddress(device_address){
	return (conf.control_addresses && conf.control_addresses.indexOf(device_address) >= 0);
}

function readSingleAddress(handleAddress){
	db.query("SELECT address FROM my_addresses WHERE wallet=?", [wallet_id], function(rows){
		if (rows.length === 0)
			throw Error("no addresses");
		if (rows.length > 1)
			throw Error("more than 1 address");
		handleAddress(rows[0].address);
	});
}

function prepareBalanceText(handleBalanceText){
	var Wallet = require('byteballcore/wallet.js');
	Wallet.readBalance(wallet_id, function(assocBalances){
		var arrLines = [];
		for (var asset in assocBalances){
			var total = assocBalances[asset].stable + assocBalances[asset].pending;
			var units = (asset === 'base') ? ' bytes' : (' of ' + asset);
			var line = total + units;
			if (assocBalances[asset].pending)
				line += ' (' + assocBalances[asset].pending + ' pending)';
			arrLines.push(line);
		}
		handleBalanceText(arrLines.join("\n"));
	});
}

function readSingleWallet(handleWallet){
    return new Promise((resolve, reject) => {
        db.query("SELECT wallet FROM wallets", function(rows){
            if (rows.length === 0) {
                reject('No wallets found.')
            } else if (rows.length > 1) {
                reject(`More than 1 wallet found: ${rows.length} are currently in the database.`)
            } else {
                resolve(rows[0].wallet);
            }
        });
    });
}

function determineIfWalletExists(){
    return new Promise((resolve, reject) => {
        db.query("SELECT wallet FROM wallets", function(rows){
            if (rows.length > 1) {
                reject(`more than 1 wallet: ${rows.length} found`);
            } else {
                resolve(rows.length > 0);
            }
        });
    });
}

if (conf.permanent_pairing_secret)
	db.query(
		"INSERT "+db.getIgnore()+" INTO pairing_secrets (pairing_secret, is_permanent, expiry_date) VALUES (?, 1, '2038-01-01')", 
		[conf.permanent_pairing_secret]
	);

setTimeout(function(){
    readKeys()
    .then((data) => {
        const mnemonic_phrase = data.mnemonic_phrase;
        const passphrase = data.passphrase;
        const deviceTempPrivKey = data.deviceTempPrivKey
        const devicePrevTempPrivKey = data.devicePrevTempPrivKey;

		var saveTempKeys = function(new_temp_key, new_prev_temp_key, onDone){
			writeKeys(mnemonic_phrase, new_temp_key, new_prev_temp_key, onDone);
		};
		var mnemonic = new Mnemonic(mnemonic_phrase);

		var devicePrivKey = mnemonic.toHDPrivateKey(passphrase).derive("m/1'").privateKey.bn.toBuffer({size:32});
		// read the id of the only wallet
		return readSingleWallet().then((wallet) => {
			// global
			wallet_id = wallet;
			var device = require('byteballcore/device.js');
			device.setDevicePrivateKey(devicePrivKey);
			let my_device_address = device.getMyDeviceAddress();
			db.query("SELECT 1 FROM extended_pubkeys WHERE device_address=?", [my_device_address], function(rows){
				if (rows.length > 1)
					throw Error("more than 1 extended_pubkey?");
				if (rows.length === 0)
					return setTimeout(function(){
						console.log('passphrase is incorrect');
						process.exit(0);
					}, 1000);
				require('byteballcore/wallet.js'); // we don't need any of its functions but it listens for hub/* messages
				device.setTempKeys(deviceTempPrivKey, devicePrevTempPrivKey, saveTempKeys);
                var deviceName = conf.deviceName || 'Dagcoin-Funding-Node';

				device.setDeviceName(deviceName);
				device.setDeviceHub(conf.hub);
				let my_device_pubkey = device.getMyDevicePubKey();
				console.log("====== my device address: "+my_device_address);
				console.log("====== my device pubkey: "+my_device_pubkey);

				let pairingString = null;

				if (conf.permanent_pairing_secret) {
                    pairingString = `${my_device_pubkey}@${conf.hub}#${conf.permanent_pairing_secret}`;
                    console.log(`====== my pairing code: ${pairingString}`);
                }

				if (conf.bLight){
					var light_wallet = require('byteballcore/light_wallet.js');
					light_wallet.setLightVendorHost(conf.hub);
				}
				eventBus.emit('headless_wallet_ready');
				setTimeout(replaceConsoleLog, 1000);

				const FundingExchangeProvider = require('./submodules/fundingExchangeProviderService');
				fundingExchangeProvider = new FundingExchangeProvider(pairingString);
                fundingExchangeProvider
                    .activate()
                    .then(() => {
                        console.log('COMPLETED ACTIVATION ... UPDATING SETTINGS')
                        return fundingExchangeProvider.updateSettings()
                    }).catch(err => {
                        console.log(err);
                    });
			});
		});
	});
}, 1000);


function handlePairing(from_address){
	/* var device = require('byteballcore/device.js');
	prepareBalanceText(function(balance_text){
		device.sendMessageToDevice(from_address, 'text', balance_text);
	}); */
	console.log(`PAIRED WITH ${from_address}`);
}

//TODO: Just keeping as an example, should be removed as well
function sendAssetFromAddress(asset, amount, from_address, to_address, recipient_device_address, onDone) {
	var device = require('byteballcore/device.js');
	var Wallet = require('byteballcore/wallet.js');
	Wallet.sendMultiPayment({
		fee_paying_wallet: wallet_id,
		asset: asset,
		to_address: to_address,
		amount: amount,
		paying_addresses: [from_address],
		change_address: from_address,
		arrSigningDeviceAddresses: [device.getMyDeviceAddress()],
		recipient_device_address: recipient_device_address,
		signWithLocalPrivateKey: signWithLocalPrivateKey
	}, (err, unit) => {
		if (onDone)
			onDone(err, unit);
	});
}

// The below events can arrive only after we read the keys and connect to the hub.
// The event handlers depend on the global var wallet_id being set, which is set after reading the keys

function setupChatEventHandlers(){
	eventBus.on('paired', function(fromAddress){
		console.log('paired '+fromAddress);
		handlePairing(fromAddress);
	});

	eventBus.on('text', function(fromAddress, text){
		console.log(`TEXT MESSAGE FROM ${fromAddress}: ${text}`);

		let message = null;

        try {
            message = JSON.parse(text);
        } catch (err) {
            console.log(`NEW MESSAGE FROM ${fromAddress}: ${text} NOT A JSON MESSAGE: ${err}`);
        }

        if (message !== null) {
            if (message.protocol === 'dagcoin') {
                console.log(`DAGCOIN MESSAGE RECEIVED FROM ${fromAddress}`);
                eventBus.emit(`dagcoin.${message.title}`, message, fromAddress);
                return Promise.resolve(true);
            }

            console.log(`JSON MESSAGE RECEIVED FROM ${fromAddress} WITH UNEXPECTED PROTOCOL: ${message.protocol}`);
        }
	});
}

exports.readSingleWallet = readSingleWallet;
exports.readSingleAddress = readSingleAddress;
exports.isControlAddress = isControlAddress;
exports.setupChatEventHandlers = setupChatEventHandlers;
exports.handlePairing = handlePairing;
exports.sendAssetFromAddress = sendAssetFromAddress;

if (require.main === module)
	setupChatEventHandlers();
