"use strict"
function FundingExchangeProvider (pairingString, xPrivKey) {
    this.conf = require('byteballcore/conf.js');
    this.eventBus = require('byteballcore/event_bus');
    this.db = require('byteballcore/db');
    this.timedPromises = require('./timedPromises');

    this.exchangeFee = this.conf.exchangeFee;
    this.totalBytes = this.conf.totalBytes;
    this.bytesPerAddress = this.conf.bytesPerAddress;
    this.maxEndUserCapacity = this.conf.maxEndUserCapacity;

    this.active = false;
    this.pairingString = pairingString;
    this.xPrivKey = xPrivKey;

    const DiscoveryService = require('./discoveryService');
    this.discoveryService = new DiscoveryService();

    console.log(`pairingString: ${this.pairingString}`);
    console.log(`xPrivKey: ${this.xPrivKey}`);

    this.initDagcoinDestination().then((myAddress) => {
        console.log(`MY ADDRESS INITIALISED TO ${myAddress}`);
    }).catch((err) => {
        console.log(`ERROR: ${err}`);
        process.exit();
    });
}

FundingExchangeProvider.prototype.activate = function () {
    if (this.active) {
        console.log('ALREADY ACTIVE');
        return Promise.resolve();
    }

    const self = this;

    console.log('GOING TO START THE BUSINESS');

    return this.discoveryService.startingTheBusiness(this.pairingString).then((response) => {
        if (response) {
            self.active = true;
            console.log(`RECEIVED A RESPONSE FOR ${self.discoveryService.messages.startingTheBusiness}: ${JSON.stringify(response)}`);
            self.keepAlive();
            return Promise.resolve();
        } else {
            console.log('NO REPLY FROM THE DISCOVERY SERVICE. CAN\'T BE SURE WHETHER IT ACCEPTED MY PROPOSAL.');
            return Promise.reject();
        }
    }).then(() => {
        console.log("ADDING REACTION TO dagcoin.request.share-funded-address");
        self.eventBus.on('dagcoin.request.share-funded-address', (message, deviceAddress) => {
            console.log(`REQUEST TO SHARE AN ADDRESS FROM ${deviceAddress}: ${JSON.stringify(message)}`);
            self.shareFundedAddress(deviceAddress, message).then(
                (sharedAddress) => {
                    console.log(`NEW SHARED ADDRESS CREATED: ${sharedAddress}`);
                },
                (err) => {
                    console.log(`COULD NOT CREATE A SHARED ADDRESS: ${err}`);
                }
            );
        });
    });
};

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
};

FundingExchangeProvider.prototype.initDagcoinDestination = function () {
    const self = this;

    if (self.dagcoinDestination) {
        return Promise.resolve(self.dagcoinDestination);
    }

    return new Promise((resolve, reject) => {
        self.db.query("SELECT wallet FROM wallets", function(rows){
            if (rows.length === 0) {
                reject('NO WALLETS FOUND');
            } else if (rows.length > 1) {
                reject(`MORE THAN 1 WALLET FOUND: ${rows.length} ARE CURRENTLY IN THE DATABASE`);
            } else {
                console.log('WALLET FOUND');
                resolve(rows[0].wallet);
            }
        });
    }).then((walletId) => {
        return new Promise((resolve, reject) => {
            self.walletDefinedByKeys.readAddresses(walletId, {}, (rows) => {
                if (!rows || rows.length === 0) {
                    reject('NO ADDRESSES AVAILABLE');
                } else {
                    self.dagcoinDestination = rows[0].address;
                    resolve(self.dagcoinDestination);
                }
            });
        });
    });
};

FundingExchangeProvider.prototype.shareFundedAddress = function (remoteDeviceAddress, message) {
    this.initComponents();

    const self = this;

    if (this.shareFundedAddressPromise) {
        return this.shareFundedAddressPromise.then(
            (sharedAddress) => {
                console.log(`SHARED ADDRESS ${sharedAddress} CREATED AND SHARED. MOVING ON WITH THE NEXT REQUEST`);
                return self.shareFundedAddress(remoteDeviceAddress, message);
            }, (err) => {
                console.log(`THERE WERE TROUBLES CREATING A SHARED ADDRESS: ${err}. MOVING ON WITH THE NEXT REQUEST`);
                return self.shareFundedAddress(remoteDeviceAddress, message);
            }
        );
    }

    const remoteAddress = message.address;

    if(!remoteAddress) {
        return Promise.reject(`NO ADDRESS FOUND IN THE MESSAGE: ${JSON.stringify(message)}`);
    }

    console.log(`REQUEST FROM ${remoteDeviceAddress}:${remoteAddress} ${JSON.stringify(message)}`);

    const myDeviceAddress = this.device.getMyDeviceAddress();

    console.log('STARTING THE ADDRESS GENERATION PROCESS');

    this.shareFundedAddressPromise = this.initDagcoinDestination().then((myAddress) => {
        return new Promise((resolve) => {
            // CHECK IF THE SHARED ADDRESS FOR THE REQUESTOR ALREADY EXISTS
            self.db.query(
                'SELECT shared_address FROM shared_address_signing_paths WHERE \
                address = ? AND device_address = ?',
                [remoteAddress, remoteDeviceAddress],
                (rows) => {
                    if (rows && rows.length > 0) {
                        resolve(rows[0].sharedAddress);
                    } else {
                        resolve(null);
                    }
                }
            );
        }).then((sharedAddressFoundInDb) => {
            if(sharedAddressFoundInDb) {
                console.log(`AN ADDRESS SHARED WITH ${remoteDeviceAddress}:${remoteAddress} WAS FOUND IN THE DB: ${sharedAddressFoundInDb}`);
                return Promise.resolve(sharedAddressFoundInDb);
            }

            console.log(`MY ADDRESS: ${myAddress}`);

            const addressDefinitionTemplate = JSON.parse(`
                [
                    "or",
                    [
                        ["address", "$address@${myDeviceAddress}"],
                        [
                            "and", [
                                ["address", "$address@${myDeviceAddress}"],
                                ["address", "$address@${remoteDeviceAddress}"]
                            ]
                        ]
                    ]
                ]
            `);

            const definitionTemplaceHash = this.objectHash.getChash160(addressDefinitionTemplate);

            // CHECK IN THE PENDING TABLES

            return new Promise(function (resolve, reject) {
                console.log(`ADDRESS DEFINITION TEMPLATE: ${JSON.stringify(addressDefinitionTemplate)}`);

                self.db.query(
                    'SELECT definition_template_chash, creation_date FROM pending_shared_addresses WHERE definition_template_chash = ?',
                    [definitionTemplaceHash],
                    function (rows) {
                        console.log(`FOUND ${rows.length} WITH definition_template_chash ${definitionTemplaceHash}`);
                        if (rows.length > 0) {
                            const existingTmp = rows[0];

                            if (new Date(existingTmp.creation_date).getTime() > new Date().getTime() - 1000 * 60 * 10) {
                                // WAITING 5 MINUTES FOR THE PROPOSAL TO BE ACCEPTED
                                reject("ALREADY ON PROCESSING");
                            } else {
                                // CLEANING UP THE PENDING TABLES: THE PROPOSAL WENT LOST OR WAS NOT ACCEPTED
                                self.db.query(
                                    'DELETE FROM pending_shared_address_signing_paths WHERE definition_template_chash = ?',
                                    [definitionTemplaceHash],
                                    () => {
                                        self.db.query(
                                            'DELETE FROM pending_shared_addresses WHERE definition_template_chash = ?',
                                            [definitionTemplaceHash],
                                            () => {
                                                resolve();
                                            }
                                        );
                                    }
                                );
                            }
                        } else {
                            resolve();
                        }
                    }
                );
            }).then(() => {
                self.walletDefinedByAddress.createNewSharedAddressByTemplate(addressDefinitionTemplate, myAddress, {"r": myDeviceAddress });
                resolve(definitionTemplaceHash);
            });
        });
    }).then((definitionTemplaceHash) => {
        console.log(`SHARED ADDRESS: ${sharedAddress}`);

        const response = {
            protocol: 'dagcoin',
            title: 'response.share-funded-address',
            byteOrigin: definitionTemplaceHash, // TODO: this is not the right address. It might not be ready yet at this point
            dagcoinDestination: self.dagcoinDestination
        };

        if (message.id !== null) {
            response.id = message.id;
        }

        return new Promise((resolve, reject) => {
            self.device.sendMessageToDevice(
                remoteDeviceAddress,
                'text',
                JSON.stringify(response),
                {
                    ifOk() {
                        resolve(definitionTemplaceHash);
                    },
                    ifError(error) {
                        reject(error);
                    }
                }
            );
        });
    }).then(
        (definitionTemplaceHash) => {
            this.shareFundedAddressPromise = null;
            return Promise.resolve(definitionTemplaceHash);
        },
        (error) => {
            this.shareFundedAddressPromise = null;
            return Promise.reject(error);
        }
    );

    return this.shareFundedAddressPromise;
};

FundingExchangeProvider.prototype.initComponents = function () {
    if (!this.mutex) {
        this.mutex = require('byteballcore/mutex.js');
    }

    if (!this.device) {
        this.device = require('byteballcore/device.js');
    }

    if (!this.db) {
        this.db = require('byteballcore/db');
    }

    if (!this.objectHash) {
        this.objectHash = require('byteballcore/object_hash');
    }

    if (!this.walletDefinedByKeys) {
        this.walletDefinedByKeys = require('byteballcore/wallet_defined_by_keys');
    }

    if (!this.walletDefinedByAddress) {
        this.walletDefinedByAddress = require('byteballcore/wallet_defined_by_addresses');
    }

    if (!this.async) {
        this.async = require('async');
    }

    if (!this.constants) {
        this.constants = require('byteballcore/constants.js');
    }

    if (!this.ecdsaSig) {
        this.ecdsaSig = require('byteballcore/signature.js');
    }
};

FundingExchangeProvider.prototype.handleSharedPaymentRequest = function () {
    const assocChoicesByUnit = {};

    this.initComponents();

    const self = this;

    self.eventBus.on("signing_request", function(objAddress, top_address, objUnit, assocPrivatePayloads, from_address, signing_path){

        function createAndSendSignature(){
            const coin = "0";
            const path = "m/44'/" + coin + "'/" + objAddress.account + "'/"+objAddress.is_change+"/"+objAddress.address_index;
            console.log("path "+path);

            const privateKey = self.xPrivKey.derive(path).privateKey;
            console.log("priv key:", privateKey);
            //var privKeyBuf = privateKey.toBuffer();
            const privKeyBuf = privateKey.bn.toBuffer({size:32}); // https://github.com/bitpay/bitcore-lib/issues/47
            console.log("priv key buf:", privKeyBuf);
            const buf_to_sign = self.objectHash.getUnitHashToSign(objUnit);
            const signature = self.ecdsaSig.sign(buf_to_sign, privKeyBuf);
            bbWallet.sendSignature(from_address, buf_to_sign.toString("base64"), signature, signing_path, top_address);
            console.log("sent signature "+signature);
        }

        function refuseSignature(){
            const buf_to_sign = self.objectHash.getUnitHashToSign(objUnit);
            bbWallet.sendSignature(from_address, buf_to_sign.toString("base64"), "[refused]", signing_path, top_address);
            console.log("refused signature");
        }

        const bbWallet = require('byteballcore/wallet.js');
        const unit = objUnit.unit;
        self.mutex.lock(["signing_request-"+unit], function(unlock){

            // apply the previously obtained decision.
            // Unless the priv key is encrypted in which case the password request would have appeared from nowhere
            if (assocChoicesByUnit[unit]){
                if (assocChoicesByUnit[unit] === "approve")
                    createAndSendSignature();
                else if (assocChoicesByUnit[unit] === "refuse")
                    refuseSignature();
                return unlock();
            }

            self.walletDefinedByKeys.readChangeAddresses(objAddress.wallet, function(arrChangeAddressInfos){
                const arrAuthorAddresses = objUnit.authors.map(function(author){ return author.address; });
                let arrChangeAddresses = arrChangeAddressInfos.map(function(info){ return info.address; });
                arrChangeAddresses = arrChangeAddresses.concat(arrAuthorAddresses);
                arrChangeAddresses.push(top_address);
                const arrPaymentMessages = objUnit.messages.filter(function(objMessage){ return (objMessage.app === "payment"); });
                if (arrPaymentMessages.length === 0)
                    throw Error("no payment message found");
                const assocAmountByAssetAndAddress = {};
                // exclude outputs paying to my change addresses
                self.async.eachSeries(
                    arrPaymentMessages,
                    function(objMessage, cb){
                        let payload = objMessage.payload;
                        if (!payload)
                            payload = assocPrivatePayloads[objMessage.payload_hash];
                        if (!payload)
                            throw Error("no inline payload and no private payload either, message="+JSON.stringify(objMessage));
                        const asset = payload.asset || "base";
                        if (!payload.outputs)
                            throw Error("no outputs");
                        if (!assocAmountByAssetAndAddress[asset])
                            assocAmountByAssetAndAddress[asset] = {};
                        payload.outputs.forEach(function(output){
                            if (arrChangeAddresses.indexOf(output.address) === -1){
                                if (!assocAmountByAssetAndAddress[asset][output.address])
                                    assocAmountByAssetAndAddress[asset][output.address] = 0;
                                assocAmountByAssetAndAddress[asset][output.address] += output.amount;
                            }
                        });
                        cb();
                    },
                    function(){
                        const unitName = "bytes";//config.unitName;
                        const bbUnitName = 'blackbytes';//config.bbUnitName;

                        const arrDestinations = [];
                        for (let asset in assocAmountByAssetAndAddress){

                            let currency = "of asset "+asset;
                            let assetName = asset;
                            if(asset === 'base'){
                                currency = unitName;
                                assetName = 'base';
                            }else if(asset === self.constants.BLACKBYTES_ASSET){
                                currency = bbUnitName;
                                assetName = 'blackbytes';
                            }
                            for (let address in assocAmountByAssetAndAddress[asset])
                                arrDestinations.push(assocAmountByAssetAndAddress[asset][address] + assetName + " " + currency + " to " + address);
                        }
                        const dest = (arrDestinations.length > 0) ? arrDestinations.join(", ") : "to myself";
                        // var question = 'Sign transaction spending '+dest+' from wallet '+wallet_id+'?';
                        // console.log(question);

                        console.log(`ASSOCIATED AMOUNTS BY ASSET AND ADDRESS ${JSON.stringify(assocAmountByAssetAndAddress)}`);
                        console.log(`DAGCOIN DESTINATION: ${self.dagcoinDestination}`);
                        console.log(`DAGCOIN AMOUNT TO DESTINATION: ${JSON.stringify(assocAmountByAssetAndAddress[self.conf.dagcoinAsset][self.dagcoinDestination])}`);

                        let approve = true;

                        // The service fee must be present and equal to 500 microdags.
                        if (
                            !assocAmountByAssetAndAddress[self.conf.dagcoinAsset]
                            || !assocAmountByAssetAndAddress[self.conf.dagcoinAsset][self.dagcoinDestination]
                            || assocAmountByAssetAndAddress[self.conf.dagcoinAsset][self.dagcoinDestination] !== 500
                        ) {
                            approve = false;
                        }

                        for(let asset in assocAmountByAssetAndAddress) {
                            // No asset transfer other than dagcoin, bytes or blackbytes can be listed in the transaction
                            if (asset !== self.conf.dagcoinAsset && asset !== 'base' && asset !== 'blackbytes') {
                                approve = false;
                            }

                            // No bytes nor blackbytes can be actively transfered. Only passively (fee payment from the shared address)
                            if (asset === 'base' || asset === 'blackbytes') {
                                if(assocAmountByAssetAndAddress[asset].length > 0) {
                                    approve = false;
                                }
                            }
                        }

                        if (approve) {
                            //APPROVED if there is an output to the base address of some dagcoins
                            createAndSendSignature();
                            assocChoicesByUnit[unit] = "approve";
                        } else { //NOT APPROVED
                            refuseSignature();
                            assocChoicesByUnit[unit] = "refuse";
                        }

                        unlock();
                    }
                ); // eachSeries
            });
        });
    });
};


module.exports = FundingExchangeProvider;