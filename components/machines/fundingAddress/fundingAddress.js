"use strict";

const StateMachine = require('../../fsm/stateMachine');

module.exports = function (addressObject) {
    const statusMap = {
        'NEW': 'not-proofed',
        'NOT_PROOFED': 'not-proofed',
        'PROOFED': 'proofed-legacy',
        'LEGACY': 'proofed-legacy',
        'READY': 'proofed-legacy',
        'VOID': 'void'
    };

    const fundingAddressStateMachine = new StateMachine(
        {
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
        [
            {
                name: 'not-proofed',
                evaluationPeriod: 120 * 1000,
                actionsIn: [{
                    name: 'proofAddress',
                    address: addressObject.master_address,
                    deviceAddress: addressObject.master_device_address
                }],
                fetchers: [{
                    name: 'proofInDb',
                    address: addressObject.master_address,
                    deviceAddress: addressObject.master_device_address
                }]
            },
            {
                name: 'proofed-legacy',
                fetchers: [
                    {name: 'enoughDagcoins', masterAddress: addressObject.master_address},
                    {name: 'enoughBytes', sharedAddress: addressObject.shared_address}
                ]
            },
            {
                name: 'can-fuel-ready',
                fetchers: [
                    {name: 'enoughDagcoins', masterAddress: addressObject.master_address},
                    {name: 'enoughBytes', sharedAddress: addressObject.shared_address}
                ],
                actionsIn: [{name: 'setStatus', sharedAddress: addressObject.shared_address, status: 'READY'}],
                listensTo: [`dagcoin.payment.${addressObject.shared_address}`]
            },
            {
                name: 'need-fuel',
                evaluationPeriod: 30 * 1000,
                fetchers: [
                    {name: 'enoughDagcoins', masterAddress: addressObject.master_address},
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
                    {name: 'newLoadedAddresses', deviceAddress: addressObject.master_device_address},
                    {name: 'enoughDagcoins', masterAddress: addressObject.master_address},
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
        statusMap[addressObject.status],
        [
            {
                fromState: 'not-proofed', toState: 'proofed-legacy', checkCondition: (data) => {
                return data['proofInDb'];
            }
            },
            {fromState: 'not-proofed', toState: 'void', checkCondition: (data) => {return false;}},


            {
                fromState: 'proofed-legacy', toState: 'can-fuel-ready', checkCondition: (data) => {
                return data['enoughDagcoins'] && data['enoughBytes'];
            }
            },
            {
                fromState: 'proofed-legacy', toState: 'cannot-fuel', checkCondition: (data) => {
                return !data['enoughDagcoins'];
            }
            },
            {
                fromState: 'proofed-legacy', toState: 'need-fuel', checkCondition: (data) => {
                return data['enoughDagcoins'] && !data['enoughBytes'];
            }
            },
            {fromState: 'proofed-legacy', toState: 'void', checkCondition: (data) => {return false;}},


            {
                fromState: 'can-fuel-ready', toState: 'need-fuel', checkCondition: (data) => {
                return data['enoughDagcoins'] && !data['enoughBytes'];
            }
            },
            {
                fromState: 'can-fuel-ready', toState: 'cannot-fuel', checkCondition: (data) => {
                return !data['enoughDagcoins'];
            }
            },
            {fromState: 'can-fuel-ready', toState: 'void', checkCondition: (data) => {return false;}},


            {
                fromState: 'need-fuel', toState: 'can-fuel-ready', checkCondition: (data) => {
                return data['enoughDagcoins'] && data['enoughBytes'];
            }
            },
            {
                fromState: 'need-fuel', toState: 'cannot-fuel', checkCondition: (data) => {
                return !data['enoughDagcoins'];
            }
            },
            {fromState: 'need-fuel', toState: 'void', checkCondition: (data) => {return false;}},


            {
                fromState: 'cannot-fuel', toState: 'can-fuel-ready', checkCondition: (data) => {
                return data['enoughDagcoins'] && data['enoughBytes'];
            }
            },
            {
                fromState: 'cannot-fuel', toState: 'need-fuel', checkCondition: (data) => {
                return data['enoughDagcoins'] && !data['enoughBytes'];
            }
            },
            {fromState: 'cannot-fuel', toState: 'void', checkCondition: (data) => {return false;}}
        ]
    );

    return fundingAddressStateMachine;
};