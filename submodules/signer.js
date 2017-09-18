var constants = require('byteballcore/constants.js');
var objectHash = require('byteballcore/object_hash.js');
var ecdsaSig = require('byteballcore/signature.js');

// My module
function Signer (xPrivateKey) {
    this.xPrivateKey = xPrivateKey;
}

Signer.prototype.signWithLocalPrivateKey = (wallet_id, account, is_change, address_index, text_to_sign, handleSig) => {
    var path = "m/44'/0'/" + account + "'/"+is_change+"/"+address_index;
    var privateKey = xPrivKey.derive(path).privateKey;
    var privKeyBuf = privateKey.bn.toBuffer({size:32}); // https://github.com/bitpay/bitcore-lib/issues/47
    handleSig(ecdsaSig.sign(text_to_sign, privKeyBuf));
}

Signer.prototype.readSigningPaths = function(conn, address, handleLengthsBySigningPaths) {
    handleLengthsBySigningPaths({r: constants.SIG_LENGTH});
}

Signer.prototype.readDefinition = function(conn, address, handleDefinition) {
    conn.query("SELECT definition FROM my_addresses WHERE address=?", [address], function(rows){
        if (rows.length !== 1)
            throw "definition not found";
        handleDefinition(null, JSON.parse(rows[0].definition));
    });
}

Signer.prototype.sign = function(objUnsignedUnit, assocPrivatePayloads, address, signing_path, handleSignature) {
    var buf_to_sign = objectHash.getUnitHashToSign(objUnsignedUnit);
    var db = require('byteballcore/db.js');

    const self = this;

    db.query(
        "SELECT wallet, account, is_change, address_index \n\
        FROM my_addresses JOIN wallets USING(wallet) JOIN wallet_signing_paths USING(wallet) \n\
        WHERE address=? AND signing_path=?",
        [address, signing_path],
        function(rows){
            if (rows.length !== 1)
                throw Error(rows.length+" indexes for address "+address+" and signing path "+signing_path);
            var row = rows[0];
            self.signWithLocalPrivateKey(row.wallet, row.account, row.is_change, row.address_index, buf_to_sign, function(sig){
                handleSignature(null, sig);
            });
        }
    );
}

module.exports = Signer;