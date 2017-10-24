'use strict';

// My module
function ProofManager() {
    this.ecdsaSig = require('byteballcore/signature');
    this.db = require('byteballcore/db');
    this.hasher = require('byteballcore/object_hash');
    this.crypto = require('crypto');

    this.active = false;
}

ProofManager.prototype.activate = function () {
    if (this.active) {
        console.log('ProofManager ALREADY ACTIVE');
        return;
    }

    self.eventBus.on('dagcoin.request.proof-address', (message, deviceAddress) => {
        console.log(`REQUEST TO PROOF AN ADDRESS FROM ${deviceAddress}: ${JSON.stringify(message)}`);

        self.shareFundedAddress(deviceAddress, message).then(
            (sharedAddress) => {
                console.log(`NEW SHARED ADDRESS CREATED: ${sharedAddress}`);
            },
            (err) => {
                console.log(`COULD NOT CREATE A SHARED ADDRESS: ${err}`);
            }
        );
    });

    this.active = true;
};

ProofManager.prototype.proofAddressBatch = function (proofAddressBatch) {
    const self = this;

    if (!proofAddressBatch || proofAddressBatch.length === 0) {
        console.log('NOTHING TO PROOF');
        return Promise.resolve({validbatch: [], invalidBatch: []});
    }

    const proof = proofAddressBatch.pop();

    return self.proofAddressBatch(proofAddressBatch).then((result) => {
        return self.proofAddress(proof).then((valid) => {
            if (valid) {
                result.validbatch.push(proof);
            } else {
                result.invalidBatch.push(proof);
            }

            return Promise.resolve(result);
        });
    });
};

ProofManager.prototype.proofAddress = function (proof, deviceAddress) {
    const self = this;

    if (!proof) {
        throw Error('PARAMETER proof IS NOT SET');
    }

    if (!proof.address) {
        throw Error('PARAMETER proof.address IS NOT SET');
    }

    if (!proof.address_definition) {
        throw Error('PARAMETER proof.address_definition IS NOT SET');
    }

    if (deviceAddress && deviceAddress !== proof.deviceAddress) {
        console.log(`PROOF GIVEN FOR DEVICE ADDRESS ${proof.deviceAddress} BUT WAS REQUESTED FOR ${deviceAddress}`);
        return Promise.resolve(false);
    }

    const definition = JSON.parse(proof.address_definition);

    const definitionHash = self.hasher.getChash160(definition);

    if (definitionHash !== proof.address) {
        console.log(`DEFINITION VALIDATION FAILED: ${proof.address} IS NOT THE HASH OF ${proof.address_definition} (THI IS: ${definitionHash})`);
        return Promise.resolve(false);
    }

    console.log(`HASH 160 VALIDATED: ${proof.address} IS THE HASH OF ${proof.address_definition}`);

    const valid = self.proof(proof.device_address, proof.device_address_signature, definition);

    // IT MEANS IT DOES NOT HAVE A MASTER ADDRESS (SO IT IS ONE) OR IS ALREADY INVALID
    if (!proof.master_address || !valid) {
        return Promise.resolve(valid);
    }

    //FURTHER PROOF IN CASE OF LINK TO A MASTER ADDRESS
    return new Promise((resolve, reject) => {
        self.db.query(
            `SELECT device_address, address_definition
             FROM dagcoin_proofs 
             WHERE proofed = 1 AND address = ? AND device_address = ?`,
            [proof.master_address, proof.device_address],
            (rows) => {
                if (!rows || rows.length === 0) {
                    console.log(`COULD NOT FIND PROOF FOR MASTER ADDRESS ${proof.master_address} OF ${proof.address} WITH DEVICE
                    ${proof.device_address}`);
                    resolve(false);
                    return;
                }

                if (rows.length > 1) {
                    reject(`TOO MANY PROOF FOR MASTER ADDRESS ${proof.master_address} OF ${proof.address} WITH DEVICE
                    ${proof.device_address}`);
                    return;
                }

                const masterDeviceAddress = rows[0].device_address;

                if (!masterDeviceAddress) {
                    reject(`NO DEVICE ADDRESS FOR MASTER ADDRESS ${proof.master_address} OF ${proof.address} WITH DEVICE
                ${proof.device_address}`);
                    return;
                }

                if (masterDeviceAddress !== proof.device_address) {
                    console.log(`DEVICE ADDRESSES OF MASTER ADDRESS ${proof.master_address} AND ${proof.address} DO NOT MATCH:
                ${proof.device_address} ≃ ${masterDeviceAddress}`);
                    resolve(false);
                    return;
                }

                const masterAddressDefinition = JSON.parse(rows[0].address_definition);

                if (!masterAddressDefinition) {
                    reject(`NO ADDRESS DEFINITION FOR MASTER ADDRESS ${proof.master_address} OF ${proof.address} WITH DEVICE
                ${proof.device_address}`);
                    return;
                }

                resolve(self.proof(proof.address, proof.master_address_signature, masterAddressDefinition));
            }
        );
    });
};

ProofManager.prototype.proof = function (textToProve, signature, definition) {
    if (!textToProve) {
        throw Error('PARAMETER textToProve IS NOT SET');
    }

    if (!signature) {
        throw Error('PARAMETER signature IS NOT SET');
    }

    if (!definition) {
        throw Error('PARAMETER definition IS NOT SET');
    }

    if (!definition[0] === 'sig' || !definition[1].pubkey) {
        throw Error(`DEFINITION DOES NOT CONTAIN A PUBLIC KEY. CHECK THE DEFINITION: ${JSON.stringify(definition)}`);
    }

    const publicKey = definition[1].pubkey;

    const publicKeyBase64 = new Buffer(publicKey, 'base64');
    const bufferOfTextToProve = this.crypto.createHash('sha256').update(textToProve, 'utf8').digest();

    return this.ecdsaSig.verify(bufferOfTextToProve, signature, publicKeyBase64);
};

ProofManager.prototype.hasAddressProofInDb = function (address, deviceAddress) {
    const self = this;

    return new Promise((resolve, reject) => {
        self.db.query(
            'SELECT proofed FROM dagcoin_proofs WHERE address = ? AND device_address = ? ' +
            'UNION SELECT 1 FROM shared_addresses WHERE shared_address = ? ' +
            'UNION SELECT 1 FROM dagcoin_funding_addresses WHERE master_address = ? AND STATUS = \'LEGACY\'',
            [address, deviceAddress, address],
            (rows) => {
                if (!rows || rows.length === 0) {
                    resolve(false);
                    return;
                }

                if (rows.length > 1) {
                    reject(`MORE THAN A PROOF FOR ${address}, ${deviceAddress}. THIS IS UNEXPECTED`);
                    return;
                }

                resolve(rows[0].proofed === 1);
            }
        );
    });
};

/**
 *
 * @param proof
 * @returns {Promise} Resolves to true when the address proof is stored into the db
 */
ProofManager.prototype.proofAddressAndSaveToDB = function (proof, deviceAddress) {
    const self = this;

    if (deviceAddress && deviceAddress !== proof.device_address) {
        return Promise.resolve(false);
    }

    return new Promise((resolve, reject) => {
        self.db.query(
            'SELECT address, proofed FROM dagcoin_proofs WHERE address = ? AND device_address = ?',
            [proof.address, proof.device_address],
            (rows) => {
                if (!rows || rows.length === 0) {
                    console.log(`NO PROOF AVAILABLE FOR ${proof.address} YET`);
                    resolve (false);
                    return;
                }

                if (rows.length > 1) {
                    reject(`TOO MANY PROOFS AVAILABLE FOR ${proof.address}: ${rows.length}. CHECK THE DATABASE STATE`);
                    return;
                }

                const previousProof = rows[0];

                if (!previousProof.proofed) {
                    console.log(`ALREADY DETECTED A FAILED ATTEMPT TO PROOF ${proof.address} OWNERSHIP TO ${proof.device_address}`);

                    self.db.query(
                        'DELETE FROM dagcoin_proofs WHERE address = ? AND device_address = ?',
                        [proof.address, proof.device_address],
                        (result) => {
                            console.log(`DB DELETE OF OLD PROOF OF ${proof.address} OWNERSHIP TO ${proof.device_address} : ${result}`)
                            resolve (false);
                        }
                    );

                    return;
                }

                resolve(true);
            }
        );
    }).then((alreadyProofed) => {
        if(alreadyProofed) {
            return Promise.resolve(true);
        }

        return self.proofAddress(proof).then((proofed) => {
            return new Promise((resolve) => {
                self.db.query(`
                    INSERT INTO dagcoin_proofs (
                        address,
                        address_definition,
                        device_address_signature,
                        master_address,
                        master_address_signature,
                        device_address,
                        proofed
                    ) VALUES(?, ?, ?, ?, ?, ?, ?)`,
                    [
                        proof.address,
                        proof.address_definition,
                        proof.device_address_signature,
                        proof.master_address,
                        proof.master_address_signature,
                        proof.device_address,
                        proofed
                    ],
                    (result) => {
                        console.log(`DB DELETE OF OLD PROOF OF ${proof.address} OWNERSHIP TO ${proof.device_address} : ${result}`)
                        resolve(proofed);
                    }
                );
            });
        });
    });
};

module.exports = ProofManager;