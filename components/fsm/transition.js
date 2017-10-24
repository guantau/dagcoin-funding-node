"use strict";

function Transition (properties) {
    if (!properties) {
        throw 'MISSING properties IN Transition. THERE SHOULD BE AT LEAST A NAME {name: \'transition-name\'}';
    }

    for (let property in properties) {
        this[property] = properties[property];
    }

    if (!this.name) {
        throw 'MISSING name IN A Transition. IT IS A MANDATORY PROPERTY';
    }

    if (!this.fromState) {
        throw 'MISSING fromState IN A Transition. IT IS A MANDATORY PROPERTY';
    }

    if (!this.toState) {
        throw 'MISSING toState IN A Transition. IT IS A MANDATORY PROPERTY';
    }
}

Transition.prototype.setStateMachine = function (stateMachine) {
    if (!stateMachine) {
        throw 'MISSING PARAMETER stateMachine';
    }

    this.stateMachine = stateMachine;
};

Transition.prototype.test = function (data) {
    if (typeof this.checkCondition != 'function') {
        throw `Transition ${this.name} DOES NOT HAVE METHOD checkCondition SET`;
    }

    this.lastCheckResult = this.checkCondition(data);

    return this.lastCheckResult;
};

Transition.prototype.trigger = function () {
    this.stateMachine.trigger(this.toState);
};

Transition.prototype.getLastCheckResult = function () {
    return this.lastCheckResult;
};

Transition.prototype.resetLastCheckResult = function () {
    delete this.lastCheckResult;
};

Transition.prototype.link = function (fromState, toState) {
    if(!fromState) {
        throw 'MISSING PARAMETER fromState';
    }

    if(!toState) {
        throw 'MISSING PARAMETER toState';
    }

    this.fromState = fromState;
    this.toState = toState;
};

Transition.prototype.getName = function () {
    return this.name;
};

Transition.prototype.getNextState = function () {
    if(!this.toStateObject) {
        throw 'MISSING TO-STATE PROPERTY! THIS IS PROBABLY A BUG IN THE STATE MACHINE IMPLEMENTATION';
    }

    return this.toStateObject;
};

module.exports = function (properties) {
    return new Transition(properties);
};