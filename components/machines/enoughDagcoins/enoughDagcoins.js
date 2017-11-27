"use strict";

const StateMachine = require('dagcoin-fsm/lib/stateMachine');

module.exports = function (address, deviceAddress) {
    return new StateMachine(
        {
            'properties': {
                name: 'enough-dagcoins-fsm',
                directory: `${__dirname}`
            },
            'states': [
                {
                    name: 'init',
                    fetchers: [
                        {
                            name: 'enoughDagcoinsOnMaster',
                            masterAddress: address
                        },
                        {
                            name: 'proofInDb',
                            address: address,
                            deviceAddress: deviceAddress
                        }
                    ]
                },
                {
                    name: 'consider-linked-addresses',
                    fetchers: [
                        {
                            name: 'enoughDagcoinsOnLinkedAddresses',
                            masterAddress: address
                        }
                    ]
                },
                {
                    name: 'ask-more-linked-addresses',
                    actionsIn: [{name: 'askMoreLinkedAddresses', deviceAddress}],
                    fetchers: [
                        {
                            name: 'enoughDagcoinsOnLinkedAddresses',
                            masterAddress: address
                        }
                    ]
                },
                {
                    name: 'enough-dags',
                    isFinal: true
                },
                {
                    name: 'not-enough-dags',
                    isFinal: true
                }
            ],
            'firstState': 'init',
            'transitions': [
                {
                    fromState: 'init', toState: 'enough-dags', checkCondition: (data) => {
                        return data['enoughDagcoinsOnMaster'];
                    }
                },
                {
                    fromState: 'init', toState: 'consider-linked-addresses', checkCondition: (data) => {
                        return !data['enoughDagcoinsOnMaster'] && data['proofInDb'];
                    }
                },
                {
                    fromState: 'init', toState: 'not-enough-dags', checkCondition: (data) => {
                        return !data['enoughDagcoinsOnMaster'] && !data['proofInDb'];
                    }
                },
                {
                    fromState: 'consider-linked-addresses', toState: 'enough-dags', checkCondition: (data) => {
                        return data['enoughDagcoinsOnLinkedAddresses'];
                    }
                },
                {
                    fromState: 'consider-linked-addresses',
                    toState: 'ask-more-linked-addresses',
                    checkCondition: (data) => {
                        return !data['enoughDagcoinsOnLinkedAddresses'];
                    }
                },
                {
                    fromState: 'ask-more-linked-addresses', toState: 'enough-dags', checkCondition: (data) => {
                        return data['enoughDagcoinsOnLinkedAddresses'];
                    }
                },
                {
                    fromState: 'ask-more-linked-addresses', toState: 'not-enough-dags', checkCondition: (data) => {
                        return !data['enoughDagcoinsOnLinkedAddresses'];
                    }
                }
            ]
        }
    );
};