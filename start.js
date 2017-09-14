/*jslint node: true */
"use strict";
var fs = require('fs');
var crypto = require('crypto');
var util = require('util');
var constants = require('byteballcore/constants.js');
var conf = require('byteballcore/conf.js');
var objectHash = require('byteballcore/object_hash.js');
var desktopApp = require('byteballcore/desktop_app.js');
var db = require('byteballcore/db.js');
var eventBus = require('byteballcore/event_bus.js');
var ecdsaSig = require('byteballcore/signature.js');
var Mnemonic = require('bitcore-mnemonic');
var Bitcore = require('bitcore-lib');

var appDataDir = desktopApp.getAppDataDir();
var KEYS_FILENAME = appDataDir + '/' + (conf.KEYS_FILENAME || 'keys.json');
var wallet_id;
var xPrivKey;

function replaceConsoleLog(){
	var log_filename = conf.LOG_FILENAME || (appDataDir + '/log.txt');
	var writeStream = fs.createWriteStream(log_filename);
	console.log('---------------');
	console.log('From this point, output will be redirected to '+log_filename);
	console.log("To release the terminal, type Ctrl-Z, then 'bg'");
	console.log = function(){
		writeStream.write(Date().toString()+': ');
		writeStream.write(util.format.apply(null, arguments) + '\n');
	};
	console.warn = console.log;
	console.info = console.log;
}

function createConfigurationFile() {
    var deviceName = require('os').hostname() || '-Funding-Node';

    var userConfFile = appDataDir + '/conf.json';

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
    const passphrase = '123';

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
               return Promise.resolve({mnemonic_phrase: keys.mnemonic_phrase, passphrase, deviceTempPrivKey, devicePrevTempPrivKey});
           } else {
               console.log('Wallet not found. Creating one.');
               var xPrivKey = mnemonic.toHDPrivateKey(passphrase);
               return createWalletAndIssueNewAddress(xPrivKey).then((addressInfo) => {
                   console.log(`New address issued: ${JSON.stringify(addressInfo)}`);
                   return Promise.resolve({mnemonic_phrase: keys.mnemonic_phrase, passphrase, deviceTempPrivKey, devicePrevTempPrivKey});
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

function createWalletAndIssueNewAddress(xPrivKey){
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

function signWithLocalPrivateKey(wallet_id, account, is_change, address_index, text_to_sign, handleSig){
	var path = "m/44'/0'/" + account + "'/"+is_change+"/"+address_index;
	var privateKey = xPrivKey.derive(path).privateKey;
	var privKeyBuf = privateKey.bn.toBuffer({size:32}); // https://github.com/bitpay/bitcore-lib/issues/47
	handleSig(ecdsaSig.sign(text_to_sign, privKeyBuf));
}

var signer = {
	readSigningPaths: function(conn, address, handleLengthsBySigningPaths){
		handleLengthsBySigningPaths({r: constants.SIG_LENGTH});
	},
	readDefinition: function(conn, address, handleDefinition){
		conn.query("SELECT definition FROM my_addresses WHERE address=?", [address], function(rows){
			if (rows.length !== 1)
				throw "definition not found";
			handleDefinition(null, JSON.parse(rows[0].definition));
		});
	},
	sign: function(objUnsignedUnit, assocPrivatePayloads, address, signing_path, handleSignature){
		var buf_to_sign = objectHash.getUnitHashToSign(objUnsignedUnit);
		db.query(
			"SELECT wallet, account, is_change, address_index \n\
			FROM my_addresses JOIN wallets USING(wallet) JOIN wallet_signing_paths USING(wallet) \n\
			WHERE address=? AND signing_path=?", 
			[address, signing_path],
			function(rows){
				if (rows.length !== 1)
					throw Error(rows.length+" indexes for address "+address+" and signing path "+signing_path);
				var row = rows[0];
				signWithLocalPrivateKey(row.wallet, row.account, row.is_change, row.address_index, buf_to_sign, function(sig){
					handleSignature(null, sig);
				});
			}
		);
	}
};


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

        console.log(`${mnemonic_phrase} ${passphrase} ${deviceTempPrivKey} ${devicePrevTempPrivKey}`);
		var saveTempKeys = function(new_temp_key, new_prev_temp_key, onDone){
			writeKeys(mnemonic_phrase, new_temp_key, new_prev_temp_key, onDone);
		};
		var mnemonic = new Mnemonic(mnemonic_phrase);
		// global
		xPrivKey = mnemonic.toHDPrivateKey(passphrase);
		var devicePrivKey = xPrivKey.derive("m/1'").privateKey.bn.toBuffer({size:32});
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
				device.setDeviceName(conf.deviceName);
				device.setDeviceHub(conf.hub);
				let my_device_pubkey = device.getMyDevicePubKey();
				console.log("====== my device address: "+my_device_address);
				console.log("====== my device pubkey: "+my_device_pubkey);
				if (conf.permanent_pairing_secret)
					console.log("====== my pairing code: "+my_device_pubkey+"@"+conf.hub+"#"+conf.permanent_pairing_secret);
				if (conf.bLight){
					var light_wallet = require('byteballcore/light_wallet.js');
					light_wallet.setLightVendorHost(conf.hub);
				}
				eventBus.emit('headless_wallet_ready');
				setTimeout(replaceConsoleLog, 1000);
			});
		});
	});
}, 1000);


function handlePairing(from_address){
	var device = require('byteballcore/device.js');
	prepareBalanceText(function(balance_text){
		device.sendMessageToDevice(from_address, 'text', balance_text);
	});
}

function sendPayment(asset, amount, to_address, change_address, device_address, onDone){
	var device = require('byteballcore/device.js');
	var Wallet = require('byteballcore/wallet.js');
	Wallet.sendPaymentFromWallet(
		asset, wallet_id, to_address, amount, change_address, 
		[], device_address, 
		signWithLocalPrivateKey, 
		function(err, unit){
			if (device_address) {
				if (err)
					device.sendMessageToDevice(device_address, 'text', "Failed to pay: " + err);
				else
				// if successful, the peer will also receive a payment notification
					device.sendMessageToDevice(device_address, 'text', "paid");
			}
			if (onDone)
				onDone(err, unit);
		}
	);
}

function sendAllBytesFromAddress(from_address, to_address, recipient_device_address, onDone) {
	var device = require('byteballcore/device.js');
	var Wallet = require('byteballcore/wallet.js');
	Wallet.sendMultiPayment({
		asset: null,
		to_address: to_address,
		send_all: true,
		paying_addresses: [from_address],
		arrSigningDeviceAddresses: [device.getMyDeviceAddress()],
		recipient_device_address: recipient_device_address,
		signWithLocalPrivateKey: signWithLocalPrivateKey
	}, (err, unit) => {
		if(onDone)
			onDone(err, unit);
	});
}

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

function issueChangeAddressAndSendPayment(asset, amount, to_address, device_address, onDone){
	if (conf.bSingleAddress){
		readSingleAddress(function(change_address){
			sendPayment(asset, amount, to_address, change_address, device_address, onDone);
		});
	}
	else if (conf.bStaticChangeAddress){
		issueOrSelectStaticChangeAddress(function(change_address){
			sendPayment(asset, amount, to_address, change_address, device_address, onDone);
		});
	}
	else{
		var walletDefinedByKeys = require('byteballcore/wallet_defined_by_keys.js');
		walletDefinedByKeys.issueOrSelectNextChangeAddress(wallet_id, function(objAddr){
			sendPayment(asset, amount, to_address, objAddr.address, device_address, onDone);
		});
	}
}

function issueOrSelectNextMainAddress(handleAddress){
	var walletDefinedByKeys = require('byteballcore/wallet_defined_by_keys.js');
	walletDefinedByKeys.issueOrSelectNextAddress(wallet_id, 0, function(objAddr){
		handleAddress(objAddr.address);
	});
}

function issueOrSelectStaticChangeAddress(handleAddress){
	var walletDefinedByKeys = require('byteballcore/wallet_defined_by_keys.js');
	walletDefinedByKeys.readAddressByIndex(wallet_id, 1, 0, function(objAddr){
		if (objAddr)
			return handleAddress(objAddr.address);
		walletDefinedByKeys.issueAddress(wallet_id, 1, 0, function(objAddr){
			handleAddress(objAddr.address);
		});
	});
}

function handleText(from_address, text){
	
	text = text.trim();
	var fields = text.split(/ /);
	var command = fields[0].trim().toLowerCase();
	var params =['',''];
	if (fields.length > 1) params[0] = fields[1].trim();
	if (fields.length > 2) params[1] = fields[2].trim();

	var walletDefinedByKeys = require('byteballcore/wallet_defined_by_keys.js');
	var device = require('byteballcore/device.js');
	switch(command){
		case 'address':
			if (conf.bSingleAddress)
				readSingleAddress(function(address){
					device.sendMessageToDevice(from_address, 'text', address);
				});
			else
				walletDefinedByKeys.issueOrSelectNextAddress(wallet_id, 0, function(addressInfo){
					device.sendMessageToDevice(from_address, 'text', addressInfo.address);
				});
			break;
			
		case 'balance':
			prepareBalanceText(function(balance_text){
				device.sendMessageToDevice(from_address, 'text', balance_text);
			});
			break;
			
		case 'pay':
			analyzePayParams(params[0], params[1], function(asset, amount){
				if(asset===null && amount===null){
					var msg = "syntax: pay [amount] [asset]";
					msg +=	"\namount: digits only";
					msg +=	"\nasset: one of '', 'bytes', 'blackbytes', ASSET_ID";
					msg +=	"\n";
					msg +=	"\nExample 1: 'pay 12345' pays 12345 bytes";
					msg +=	"\nExample 2: 'pay 12345 bytes' pays 12345 bytes";
					msg +=	"\nExample 3: 'pay 12345 blackbytes' pays 12345 blackbytes";
					msg +=	"\nExample 4: 'pay 12345 qO2JsiuDMh/j+pqJYZw3u82O71WjCDf0vTNvsnntr8o=' pays 12345 blackbytes";
					msg +=	"\nExample 5: 'pay 12345 ASSET_ID' pays 12345 of asset with ID ASSET_ID";
					return device.sendMessageToDevice(from_address, 'text', msg);
				}
				
				if (!conf.payout_address)
					return device.sendMessageToDevice(from_address, 'text', "payout address not defined");

				function payout(amount, asset){
					if (conf.bSingleAddress)
						readSingleAddress(function(address){
							sendPayment(asset, amount, conf.payout_address, address, from_address);
						});
					else
						// create a new change address or select first unused one
						issueChangeAddressAndSendPayment(asset, amount, conf.payout_address, from_address);
				};

				if(asset!==null){
					db.query("SELECT unit FROM assets WHERE unit=?", [asset], function(rows){
						if(rows.length===1){
							// asset exists
							payout(amount, asset);
						}else{
							// unknown asset
							device.sendMessageToDevice(from_address, 'text', 'unknown asset: '+asset);
						}
					});
				}else{
					payout(amount, asset);
				}

			});
			break;

		default:
				return device.sendMessageToDevice(from_address, 'text', "unrecognized command");
	}
}

function analyzePayParams(amountText, assetText, cb){
	// expected: 
	// amountText = amount; only digits
	// assetText = asset; '' -> whitebytes, 'bytes' -> whitebytes, 'blackbytes' -> blackbytes, '{asset-ID}' -> any asset

	if (amountText===''&&assetText==='') return cb(null, null);

	var pattern = /^\d+$/;
    if(pattern.test(amountText)){

		var amount = parseInt(amountText);

		var asset = assetText.toLowerCase();
		switch(asset){
			case '':
			case 'bytes':
				return cb(null, amount);
			case 'blackbytes':
				return cb(constants.BLACKBYTES_ASSET, amount);
			default:
				// return original assetText string because asset ID it is case sensitive
				return cb(assetText, amount);
		}

	}else{
		return cb(null, null);
	}
}

// The below events can arrive only after we read the keys and connect to the hub.
// The event handlers depend on the global var wallet_id being set, which is set after reading the keys

function setupChatEventHandlers(){
	eventBus.on('paired', function(from_address){
		console.log('paired '+from_address);
		if (!isControlAddress(from_address))
			return console.log('ignoring pairing from non-control address');
		handlePairing(from_address);
	});

	eventBus.on('text', function(from_address, text){
		console.log('text from '+from_address+': '+text);
		if (!isControlAddress(from_address))
			return console.log('ignoring text from non-control address');
		handleText(from_address, text);
	});
}

exports.readSingleWallet = readSingleWallet;
exports.readSingleAddress = readSingleAddress;
exports.signer = signer;
exports.isControlAddress = isControlAddress;
exports.issueOrSelectNextMainAddress = issueOrSelectNextMainAddress;
exports.issueOrSelectStaticChangeAddress = issueOrSelectStaticChangeAddress;
exports.issueChangeAddressAndSendPayment = issueChangeAddressAndSendPayment;
exports.setupChatEventHandlers = setupChatEventHandlers;
exports.handlePairing = handlePairing;
exports.handleText = handleText;
exports.sendAllBytesFromAddress = sendAllBytesFromAddress;
exports.sendAssetFromAddress = sendAssetFromAddress;

if (require.main === module)
	setupChatEventHandlers();
