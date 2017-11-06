/*jslint node: true */
"use strict";

//exports.port = 6611;
//exports.myUrl = 'wss://mydomain.com/bb';
exports.bServeAsHub = false;
exports.bLight = true;

exports.environment='test';

exports.storage = 'sqlite';
exports.sentryUrl = 'https://7169094cd11e474682fef59e8c840d67:674071c825054e109584f5d1a6139afc@sentry.io/238680';

exports.deviceName = 'Testnet-Funding-Node';
exports.hub = 'byteball.org/bb-test';
//exports.hub = 'testnetexplorer.dagcoin.org/wss/';
exports.permanent_pairing_secret = '1G5kGcBcsfkH';
exports.control_addresses = ['DEVICE ALLOWED TO CHAT'];
exports.payout_address = 'WHERE THE MONEY CAN BE SENT TO';
exports.KEYS_FILENAME = 'keys.json';

// DISCOVERY SERVICE PAIRING CODE
// Testnet on PowerEdge
exports.discoveryServicePairingCode = 'AnqLjlEMkQsoP6yZ/vDwT41F3IE6ItfggF0oxyYsUj42@testnetexplorer.dagcoin.org/wss/#0000';
// Yary's public testnet server
//exports.discoveryServicePairingCode = 'AhHZrVJAABB2fVTbO2CNZjvXjUi0QwaazL1uy5OMbn5O@byteball.org/bb-test#0000';
// Local to Yary's machine
// exports.discoveryServicePairingCode = 'A8EImXA5RtFDBstX3u1CzcVmcKm8jmBBYlMm93FAHQ0z@byteball.org/bb-test#0000';

// where logs are written to (absolute path).  Default is log.txt in app data directory
//exports.LOG_FILENAME = '/dev/null';

// this is for runnining RPC service only, see play/rpc_service.js
exports.rpcInterface = '127.0.0.1';
exports.rpcPort = '6332';

exports.exchangeFee = 0.0005;
exports.totalBytes =  100000;
exports.bytesPerAddress = 10000;
exports.maxEndUserCapacity = 10;

exports.passPhrase = '123';
exports.dagcoinAsset = 'B9dw3C3gMC+AODL/XqWjFh9jFe31jS08yf2C3zl8XGg=';

exports.MIN_PAYMENT_DELAY = 5 * 1000;
exports.MIN_RETRY_PAYMENT_DELAY = 60 * 1000; // How many millis before retrying a failed payment
exports.MIN_STABLE_BYTES_ON_MAIN_BEFORE_FUNDING = 2000;
exports.MAIN_ADDRESS_FUNDS_INSPECTION_PERIOD = 10 * 1000;

console.log('finished headless conf');
