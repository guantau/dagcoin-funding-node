"use strict";

function State(properties) {
    if (!properties) {
        throw 'MISSING properties IN State. THERE SHOULD BE AT LEAST A NAME {name: \'state-name\'}';
    }

    for (let property in properties) {
        this[property] = properties[property];
    }

    if (!this.name) {
        throw `properties.name NAME IN A STATE. IT IS A MANDATORY PROPERTY. CHECK :${properties}`;
    }

    if (this.evaluationPeriod && typeof this.evaluationPeriod !== 'number') {
        throw Error(`PROPERTY evaluationPeriod OF State ${this.name} IS SET BUT NOT A NUMBER. CHECK: CHECK :${properties}`);
    }

    this.eventBus = require('byteballcore/event_bus.js');
}

State.prototype.setStateMachine = function (stateMachine) {
    if (!stateMachine) {
        throw 'MISSING PARAMETER stateMachine';
    }

    this.stateMachine = stateMachine;
};

State.prototype.fetchData = function () {
    const self = this;

    const dataPromises = [];

    console.log(`FETCHING FOR ${self.name} ...`);

    self.dataFetchers.forEach((fetcher) => {
        dataPromises.push(fetcher.call());
    });

    try {
        return Promise.all(dataPromises).then((results) => {

            const data = {};

            for (let i = 0; i < self.dataFetchers.length; i += 1) {
                data[self.dataFetchers[i].getName()] = results[i];
            }

            return Promise.resolve(data);
        });
    } catch (e) {
        console.log(`${JSON.stringify(e)}`);
    }
};

State.prototype.ping = function () {
    if (this.isFinal) {
        console.log(`METHOD check CALLED ON FINAL STATE ${this.name} OF STATE MACHINE ${this.stateMachine.getName()}`);
        return Promise.resolve(null);
    }

    if (!this.transitions) {
        throw `STATE ${this.name} DOES NOT HAVE TRANSITIONS`;
    }

    const self = this;

    delete self.lastData;

    return self.fetchData().then((data) => {
        self.lastData = data;

        let transitionsTriggeredCounter = 0;
        let triggeringTransition = null;

        for (let transitionName in self.transitions) {
            const transition = self.transitions[transitionName];

            if (typeof transition.test !== 'function') {
                throw `Transition DEFINED WITHOUT METHOD test: ${JSON.stringify(transition)}`;
            }

            if (transition.test(data)) {
                transitionsTriggeredCounter += 1;
                triggeringTransition = transition;
            }
        }

        if (transitionsTriggeredCounter > 1) {
            throw `MORE THAN A TRANSITION WOULD TRIGGER`
        }

        return Promise.resolve(triggeringTransition);
    }).catch((err) => {
        console.log(`SOMETHING WENT WRONG FETCHING DATA FOR ${self.name}: ${err}`);
    });
};

State.prototype.addTransition = function (transition) {
    if (!this.transitions) {
        this.transitions = {};
    }

    if (this.transitions[transition.name]) {
        throw `DOUBLE TRANSITION DEFINITION!! ${transition.name} ALREADY DEFINED IN STATE ${this.name}`;
    }

    this.transitions[transition.name] = transition;
};

State.prototype.enable = function () {
    const self = this;

    if (self.triggersAndTimersEnabled) {
        console.log(`TRIGGERS AND TIMERS OF STATE ${this.name} OF ${this.stateMachine.getnName()} ALREADY INITIALIZED`);
        return;
    }

    if (self.evaluationPeriod) {
        if (typeof self.evaluationPeriod !== 'number') {
            throw Error(`PROPERTY evaluationPeriod OF State ${self.name} IS SET BUT NOT A NUMBER. CHECK`);
        } else {
            self.evaluationIntervalId = setInterval(() => {
                this.stateMachine.recursivePingSafe();
            }, self.evaluationPeriod);
        }
    }

    if (self.listensTo) {
        if (self.listensTo.constructor !== Array) {
            throw `State PROPERTY listensTo IS SET BUT NOT AN ARRAY. CHECK THE DEFINITION : ${JSON.stringify(self)}`;
        }

        self.listener = () => {
            self.stateMachine.recursivePingSafe();
        };

        self.listensTo.forEach((event) => {
            self.eventBus.on(event, self.listener);
        });
    }

    if (self.implementedActionsIn) {
        const actionArray = [];

        console.log(`${JSON.stringify(self.actionsIn[0])}`),
        self.implementedActionsIn.forEach((action) => {
            if(typeof action.execute !== 'function') {
                throw Error(`Action WITHOUT execute METHOD: ${JSON.stringify(action)}`);
            }

            actionArray.push(action.execute());
        });

        return Promise.all(actionArray).then(() => {
            self.triggersAndTimersEnabled = true;

            return Promise.resolve();
        });
    } else {
        self.triggersAndTimersEnabled = true;

        return Promise.resolve();
    }
};

State.prototype.disable = function () {
    const self = this;

    if (self.evaluationIntervalId) {
        clearInterval(self.evaluationIntervalId);
        delete self.evaluationIntervalId;
    }

    if (self.listensTo) {
        if (self.listensTo.constructor !== Array) {
            throw `State PROPERTY listensTo IS SET BUT NOT AN ARRAY. CHECK THE DEFINITION : ${JSON.stringify(self)}`;
        }

        self.listensTo.forEach((event) => {
            console.log(`REMOVED LISTENER FOR ${event} FROM State ${self.name}`);
            self.eventBus.removeListener(event, self.listener);
        });

        delete self.listener;
    }

    if (self.implementedActionsOut) {
        const actionArray = [];

        self.implementedActionsOut.forEach((action) => {
            actionArray.push(action.execute());
        });

        return Promise.all(actionArray).then(() => {
            self.triggersAndTimersEnabled = false;

            return Promise.resolve();
        });
    } else {
        self.triggersAndTimersEnabled = false;

        return Promise.resolve();
    }
};

State.prototype.getName = function () {
    return this.name;
};

State.prototype.setDataFetchers = function (dataFetchers) {
    if (!dataFetchers || dataFetchers.length === 0) {
        throw 'MISSING ARGUMENT dataFetchers IN State.setDataFetchers(), THERE SHOULD BE AT LEAST ONE';
    }

    this.dataFetchers = dataFetchers;
};

State.prototype.addDataFetcher = function (fetcher) {
    if (!fetcher) {
        throw 'MISSING ARGUMENT fetcher IN State.addDataFetcher()';
    }

    if (!this.dataFetchers) {
        this.dataFetchers = [];
    }

    if (typeof fetcher.getName !== 'function') {
        throw `DataFetcher DEFINED WITHOUT METHOD getName: ${JSON.stringify(fetcher)}`;
    }

    if (typeof fetcher.retrieveData !== 'function') {
        throw `DataFetcher DEFINED WITHOUT METHOD retrieveData: ${JSON.stringify(fetcher)}`;
    }

    this.dataFetchers.push(fetcher);
};

State.prototype.addActionIn = function (action) {
    if (!action) {
        throw 'MISSING ARGUMENT action IN State.addActionIn()';
    }

    if (!this.implementedActionsIn) {
        this.implementedActionsIn = [];
    }

    if (typeof action.getName !== 'function') {
        throw `Action DEFINED WITHOUT METHOD getName: ${JSON.stringify(action)}`;
    }

    if (typeof action.execute !== 'function') {
        throw `Action DEFINED WITHOUT METHOD execute: ${JSON.stringify(action)}`;
    }

    console.log(`ITS OK ${JSON.stringify(action)} NO?`);

    this.implementedActionsIn.push(action);

    console.log(`${JSON.stringify(this.implementedActionsIn)}`);
};

State.prototype.addActionOut = function (action) {
    if (!action) {
        throw 'MISSING ARGUMENT action IN State.addActionOut()';
    }

    if (!this.implementedActionsOut) {
        this.implementedActionsOut = [];
    }

    if (typeof action.getName !== 'function') {
        throw `Action DEFINED WITHOUT METHOD getName: ${JSON.stringify(action)}`;
    }

    if (typeof action.execute !== 'function') {
        throw `Action DEFINED WITHOUT METHOD execute: ${JSON.stringify(action)}`;
    }

    this.implementedActionsOut.push(action);
};

module.exports = function (properties) {
    return new State(properties);
};