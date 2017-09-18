/*jslint node: true */
"use strict";

//exports.port = 6611;
//exports.myUrl = 'wss://mydomain.com/bb';
exports.bServeAsHub = false;
exports.bLight = true;


exports.storage = 'sqlite';

//exports.deviceName = 'SOME FANCY NAME NOT TO USE THE DEFAULT Dagcoin-Funding-Node'
//exports.hub = 'byteball.org/bb-test';
exports.hub = 'testnetexplorer.dagcoin.org/wss/';
exports.permanent_pairing_secret = '1G5kGcBcsfkH';
exports.control_addresses = ['DEVICE ALLOWED TO CHAT'];
exports.payout_address = 'WHERE THE MONEY CAN BE SENT TO';
exports.KEYS_FILENAME = 'keys.json';

// DISCOVERY SERVICE PAIRING CODE
// Testnet on PowerEdge
exports.discoveryServicePairingCode = 'AnqLjlEMkQsoP6yZ/vDwT41F3IE6ItfggF0oxyYsUj42@byteball.org/bb-test#0000';
// Yary's public testnet server
//exports.discoveryServicePairingCode = 'AhHZrVJAABB2fVTbO2CNZjvXjUi0QwaazL1uy5OMbn5O@byteball.org/bb-test#0000';
// Local to Yary's machine
// exports.discoveryServicePairingCode = 'A8EImXA5RtFDBstX3u1CzcVmcKm8jmBBYlMm93FAHQ0z@byteball.org/bb-test#0000';

// where logs are written to (absolute path).  Default is log.txt in app data directory
//exports.LOG_FILENAME = '/dev/null';

// this is for runnining RPC service only, see play/rpc_service.js
exports.rpcInterface = '127.0.0.1';
exports.rpcPort = '6332';

exports.exchangeFee = 0.001;
exports.totalBytes =  100000;
exports.bytesPerAddress = 10000;
exports.maxEndUserCapacity = 10;

console.log('finished headless conf');
