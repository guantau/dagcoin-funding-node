"use strict"

function StateMachine(properties, states, firstState, transitions) {
    if (properties) {
        for (let property in properties) {
            this[property] = properties[property];
        }

        if (!this.name) {
            throw 'MISSING name IN A STATE MACHINE. IT IS A MANDATORY PROPERTY';
        }

        if (!this.directory) {
            throw 'MISSING directory IN A STATE MACHINE. IT IS A MANDATORY PROPERTY';
        }
    }

    if (!states) {
        throw 'MISSING PARAMETER states';
    }

    if (!firstState) {
        throw 'MISSING PARAMETER firstState';
    }

    if (!transitions) {
        throw 'MISSING PARAMETER transitions';
    }

    if (states.length < 2) {
        throw `CANNOT BE A STATE MACHINE WITH LESS THAN 2 STATES: ${states.length} AVAILABLE`;
    }

    if (transitions.length < 1) {
        throw `CANNOT BE A STATE MACHINE WITH LESS THAN 1 TRANSITION: ${transitions.length} AVAILABLE`;
    }

    const DataFetcher = require('./dataFetcher');

    const State = require('./state');

    this.states = {};

    for (let i = 0; i < states.length; i += 1) {
        const stateProperties = states[i];

        if (!stateProperties.name) {
            throw `State WITHOUT name PROPERTY. CHECK YOUR StateMachine DEFINITION. FAULTY STATE DEFINITION: ${JSON.stringify(stateProperties)}`;
        }

        if (this.states[stateProperties.name]) {
            throw `DUPLICATE STATE: ${stateProperties.name}. YOU DEFINED THIS STATE TWICE, CHECK YOUR StateMachine DEFINITION`;
        }

        console.log(`State FOUND: ${stateProperties.name}`);

        let state = new State(stateProperties);

        state.setStateMachine(this);

        const Action = require('./action');

        if (stateProperties.actionsIn) {
            if (stateProperties.actionsIn.constructor !== Array) {
                throw `State PROPERTY actionsIn IS SET BUT NOT AN ARRAY. CHECK THE DEFINITION : ${JSON.stringify(stateProperties)}`;
            }

            if (stateProperties.actionsIn.length > 0) {
                stateProperties.actionsIn.forEach((actionProperties) => {
                    let action = null;

                    if (actionProperties.execute) {
                        if (typeof actionProperties.execute !== 'function') {
                            throw `Action IN PROPERTY execute MUST BE A METHOD: ${JSON.stringify(actionProperties)}`;
                        }

                        action = new Action(actionProperties);

                        if (!action) {
                            throw `COULD NOT CREATE SIMPLE Action IN WITH ${JSON.stringify(actionProperties)}`;
                        }

                        action.execute = actionProperties.execute;
                        action.getName = () => {return actionProperties.name;}
                    } else {
                        const actionPath = `${this.directory}/actions/${actionProperties.name}`;

                        action = require(actionPath)(actionProperties);

                        if (!action) {
                            throw `Action IN DEFINITION NOT FOUND IN ${actionPath}. AND NO execute METHOD DEFINED IN THE PROPERTIES. CHECK ${actionProperties}`;
                        }

                        if (typeof action.execute !== 'function') {
                            throw `Action DEFINED IN ${actionPath} HAS NO execute METHOD. CHECK ${actionPath}`;
                        }
                    }

                    state.addActionIn(action);
                });
            }
        }

        if (stateProperties.actionsOut) {
            if (stateProperties.actionsOut.constructor !== Array) {
                throw `State PROPERTY actionsIn IS SET BUT NOT AN ARRAY. CHECK THE DEFINITION : ${JSON.stringify(stateProperties)}`;
            }

            if (stateProperties.actionsOut.length > 0) {
                stateProperties.actionsOut.forEach((actionProperties) => {
                    let action = null;

                    if (actionProperties.execute) {
                        if (typeof actionProperties.execute !== 'function') {
                            throw `Action OUT PROPERTY execute MUST BE A METHOD: ${JSON.stringify(actionProperties)}`;
                        }

                        action = new Action(actionProperties);

                        if (!action) {
                            throw `COULD NOT CREATE SIMPLE Action OUT WITH ${JSON.stringify(actionProperties)}`;
                        }

                        action.execute = actionProperties.execute;
                        action.getName = () => {return actionProperties.name;}
                    } else {
                        const actionPath = `${this.directory}/actions/${actionProperties.name}`;

                        action = require(actionPath)(actionProperties);

                        if (!fetcher) {
                            throw `Action OUT DEFINITION NOT FOUND IN ${actionPath}. AND NO execute METHOD DEFINED IN THE PROPERTIES. CHECK ${actionProperties}`;
                        }
                    }

                    state.addActionOut(action);
                });
            }
        }

        if (!stateProperties.isFinal) {
            if (!stateProperties.fetchers || stateProperties.fetchers == 0) {
                throw `State WITHOUT ANY fetchers, THERE SHOULD BE ONE AT LEAST. CHECK YOUR StateMachine DEFINITION: ${JSON.stringify(stateProperties)}`;
            }

            const fetchers = stateProperties.fetchers;

            for(let j = 0; j < fetchers.length; j += 1 ) {
                const fetcherProperties = fetchers[j];

                if(!fetcherProperties.name) {
                    throw `DataFetcher DEFINED INSIDE STATE WITHOUT NAME: ${JSON.stringify(stateProperties)}`;
                }

                let fetcher = null;

                if (fetcherProperties.retrieveData) {
                    if (typeof fetcherProperties.retrieveData !== 'function') {
                        throw `DataFetcher PROPERTY retrieveData MUST BE A METHOD: ${JSON.stringify(fetcherProperties)}`;
                    }

                    fetcher = new DataFetcher(fetcherProperties);

                    if (!fetcher) {
                        throw `COULD NOT CREATE SIMPLE DataFetcher WITH ${JSON.stringify(fetcherProperties)}`;
                    }

                    fetcher.retrieveData = fetcherProperties.retrieveData;
                    fetcher.getName = () => {return fetcherProperties.name;}
                } else {
                    fetcher = require(`${this.directory}/data/${fetcherProperties.name}`)(fetcherProperties);

                    if (!fetcher) {
                        throw `DataFetcher DEFINITION NOT FOUND IN ${this.directory}/data/${fetcherProperties.name}. AND NO retrieveData METHOD DEFINED IN THE PROPERTIES.`;
                    }
                }

                console.log('FETCHER PROPERTIES');

                for (let o in fetcher) {
                    console.log(`${o}: ${JSON.stringify(fetcher[o])}`);
                }

                state.addDataFetcher(fetcher);
            }
        }

        this.states[state.getName()] = state;
    }

    this.currentState = this.states[firstState];

    if (!this.currentState) {
        throw `NO STATE DECLARED WITH NAME ${firstState}`;
    }

    const Transition = require('./transition');

    this.transitions = {};

    for (let i in transitions) {
        const transitionProperties = transitions[i];

        if (!transitionProperties.name) {
            transitionProperties.name = `${transitionProperties.fromState}-to-${transitionProperties.toState}`;
        }

        console.log(`TRANSITION FOUND: ${transitionProperties.name}`);

        let transition = null;

        if (transitionProperties.checkCondition) {
            if (typeof transitionProperties.checkCondition !== 'function') {
                throw `Transition PROPERTY checkCondition MUST BE A FUNCTION: ${JSON.stringify(transitionProperties)}`;
            }

            transition = new Transition(transitionProperties);

            if (!transition) {
                throw `COULD NOT CREATE SIMPLE STATE ${transition.name}`;
            }

            transition.checkCondition = transitionProperties.checkCondition;
        } else {
            transition = require(`${this.directory}/transitions/${transitionProperties.name}`);

            if (!transition) {
                throw `NO checkConditionMethod NOR DEFINITION FOUND AT ${this.directory}/transitions/${transitionProperties.name}. CHECK ${JSON.stringify(transitionProperties)}`;
            }

            transition.getName = () => {return transitionProperties.name};
        }

        this.transitions[transition.name] = transition;

        transition.fromStateObject = this.states[transition.fromState];

        if (!transition.fromStateObject) {
            throw `STATE ${transition.fromStateObject} NOT FOUND. CHECK THE DEFINITION OF TRANSITION ${transition.name} (fromState).`;
        }

        transition.fromStateObject.addTransition(transition);

        transition.toStateObject = this.states[transition.toState];

        if (!transition.toStateObject) {
            throw `STATE ${transition.toStateObject} NOT FOUND. CHECK THE DEFINITION OF TRANSITION ${transition.name}  (toState).`;
        }

        transition.setStateMachine(this);
    }
}

StateMachine.prototype.start = function () {
    this.currentState.enable();
};

StateMachine.prototype.ping = function () {
    const self = this;

    return self.currentState.ping().then((triggeringTransition) => {
        if (!triggeringTransition) {
            return Promise.resolve(false);
        }

        const previousState = self.currentState;

        self.currentState.disable();
        self.currentState = triggeringTransition.getNextState();
        self.currentState.enable();

        console.log(`STATE MACHINE ${self.name} MOVED FROM ${previousState.getName()} TO ${self.currentState.getName()}`);

        return Promise.resolve(true);
    });
};

StateMachine.prototype.recursivePing = function (transitions) {
    if(!transitions) {
        transitions = 0;
    }

    const self = this;

    return self.ping().then((transitionOccurred) => {
        self.pinging = false;

        if (transitionOccurred) {
            return self.recursivePing(transitions + 1);
        } else {
            return Promise.resolve(transitions);
        }
    });
};

/**
 *
 * @param updatedInformation The requestor might ping after updating the database or reporting relevant change to the state machine while
 * a previous test is currently ongoing (and is using or has used outdated information)
 * In this case the transition test should be repeated in the end.
 */
StateMachine.prototype.pingUntilOver = function (updatedInformation) {
    const self = this;

    if (self.pinging) {
        if (updatedInformation) {
            self.updatedInformation = true;
        }

        return self.pingingPromise;
    }

    self.pinging = true;

    self.pingingPromise = self.recursivePing().then(
        () => {
            if (!self.updatedInformation) {
                return Promise.resolve();
            } else {
                self.updatedInformation = false;
                return self.recursivePing();
            }
        },
        (error) => {
            console.error(`SOMETHING WENT WRONG IN ${self.name} IN STATE ${self.currentState}: ${error}`);
            return Promise.resolve();
        }
    ).then(() => {
        self.pinging = false;
        self.updatedInformation = false;
        self.pingingPromise = null;

        return Promise.resolve();
    });

    return self.pingingPromise;
};

StateMachine.prototype.getName = function () {
    return this.name;
};

StateMachine.prototype.getCurrentState = function () {
    return this.currentState;
};

module.exports = StateMachine;