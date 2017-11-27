"use strict";

const StateMachine = require('dagcoin-fsm/lib/stateMachine');

module.exports = function (addressObject) {
    return new StateMachine(
        {
            'properties': {
                name: 'funding-address-fsm',
                directory: `${__dirname}`,
                sharedAddress: addressObject.shared_address,
                masterAddress: addressObject.master_address,
                masterDeviceAddress: addressObject.master_device_address,
                definitionType: addressObject.definition_type,
                created: addressObject.created,
                last_status_change: addressObject.last_status_change,
                previous_status: addressObject.previous_status
            },
            'states': [
                {
                    name: 'new',
                    evaluationPeriod: 10 * 1000,
                    fetchers: [
                        {
                            name: 'enoughDagcoins',
                            masterAddress: addressObject.master_address,
                            deviceAddress: addressObject.master_device_address
                        },
                        {name: 'enoughBytes', sharedAddress: addressObject.shared_address}
                    ]
                },
                {
                    name: 'can-fuel-ready',
                    fetchers: [
                        {
                            name: 'enoughDagcoins',
                            masterAddress: addressObject.master_address,
                            deviceAddress: addressObject.master_device_address
                        },
                        {name: 'enoughBytes', sharedAddress: addressObject.shared_address}
                    ],
                    actionsIn: [{name: 'setStatus', sharedAddress: addressObject.shared_address, status: 'READY'}],
                    listensTo: [`dagcoin.payment.${addressObject.shared_address}`]
                },
                {
                    name: 'need-fuel',
                    evaluationPeriod: 30 * 1000,
                    fetchers: [
                        {
                            name: 'enoughDagcoins',
                            masterAddress: addressObject.master_address,
                            deviceAddress: addressObject.master_device_address
                        },
                        {name: 'enoughBytes', sharedAddress: addressObject.shared_address}
                    ],
                    actionsIn: [
                        {name: 'setStatus', sharedAddress: addressObject.shared_address, status: 'READY'},
                        {name: 'fundSharedAddress', sharedAddress: addressObject.shared_address}
                    ]
                },
                {
                    name: 'cannot-fuel',
                    evaluationPeriod: 90 * 1000,
                    fetchers: [
                        {
                            name: 'enoughDagcoins',
                            masterAddress: addressObject.master_address,
                            deviceAddress: addressObject.master_device_address
                        },
                        {name: 'enoughBytes', sharedAddress: addressObject.shared_address}
                    ],
                    actionsIn: [{name: 'setStatus', sharedAddress: addressObject.shared_address, status: 'READY'}]
                },
                {
                    name: 'void',
                    actionsIn: [{name: 'setStatus', sharedAddress: addressObject.shared_address, status: 'VOID'}],
                    isFinal: true
                }
            ],
            'firstState': 'new',
            'transitions': [
                {
                    fromState: 'new', toState: 'can-fuel-ready', checkCondition: (data) => {
                    return data['enoughDagcoins'] && data['enoughBytes'];
                }
                },
                {
                    fromState: 'new', toState:
                    'cannot-fuel', checkCondition:
                    (data) => {
                        return !data['enoughDagcoins'];
                    }
                }
                ,
                {
                    fromState: 'new', toState:
                    'need-fuel', checkCondition:
                    (data) => {
                        return data['enoughDagcoins'] && !data['enoughBytes'];
                    }
                }
                ,
                {
                    fromState: 'new', toState:
                    'void', checkCondition:
                    (data) => {
                        return false;
                    }
                }
                ,
                {
                    fromState: 'can-fuel-ready', toState:
                    'need-fuel', checkCondition:
                    (data) => {
                        return data['enoughDagcoins'] && !data['enoughBytes'];
                    }
                }
                ,
                {
                    fromState: 'can-fuel-ready', toState:
                    'cannot-fuel', checkCondition:
                    (data) => {
                        return !data['enoughDagcoins'];
                    }
                }
                ,
                {
                    fromState: 'can-fuel-ready', toState:
                    'void', checkCondition:
                    (data) => {
                        return false;
                    }
                }
                ,
                {
                    fromState: 'need-fuel', toState:
                    'can-fuel-ready', checkCondition:
                    (data) => {
                        return data['enoughDagcoins'] && data['enoughBytes'];
                    }
                }
                ,
                {
                    fromState: 'need-fuel', toState:
                    'cannot-fuel', checkCondition:
                    (data) => {
                        return !data['enoughDagcoins'];
                    }
                }
                ,
                {
                    fromState: 'need-fuel', toState:
                    'void', checkCondition:
                    (data) => {
                        return false;
                    }
                }
                ,
                {
                    fromState: 'cannot-fuel', toState:
                    'can-fuel-ready', checkCondition:
                    (data) => {
                        return data['enoughDagcoins'] && data['enoughBytes'];
                    }
                }
                ,
                {
                    fromState: 'cannot-fuel', toState:
                    'need-fuel', checkCondition:
                    (data) => {
                        return data['enoughDagcoins'] && !data['enoughBytes'];
                    }
                }
                ,
                {
                    fromState: 'cannot-fuel', toState:
                    'void', checkCondition:
                    (data) => {
                        return false;
                    }
                }
            ]
        }
    );
};