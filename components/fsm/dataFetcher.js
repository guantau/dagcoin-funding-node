"use strict"

function DataFetcher(properties, stateMachine, state) {
    if (!properties) {
        throw 'MISSING properties IN DataFetcher. THERE SHOULD BE AT LEAST A NAME {name: \'data-fetcher-name\'}';
    }

    if (properties.stateMachine != null) {
        throw Error ('PROPERTY stateMachine IS RESERVED FOR INTERNAL USE');
    }

    if (properties.state != null) {
        throw Error ('PROPERTY state IS RESERVED FOR INTERNAL USE');
    }

    if (stateMachine == null) {
        throw Error (`PROPERTY stateMachine IS NOT SET IN DataFetcher ${properties.name}`);
    }

    this.stateMachine = stateMachine;

    if (state == null) {
        throw Error (`PROPERTY state IS NOT SET IN DataFetcher ${properties.name}`);
    }

    this.state = state;

    for (let property in properties) {
        this[property] = properties[property];
    }

    if (!this.name) {
        throw 'MISSING properties.name IN A DataFetcher. IT IS A MANDATORY PROPERTY';
    }

    if (this.parameters && this.parameters.constructor !== Array) {
        throw 'PROPERTY properties.parameters IS SET BUT IS NOT AS AN ARRAY. IT MUST BE AN ARRAY. I.E.: [\'param\']';
    }
}

DataFetcher.prototype.call = function () {
    const self = this;

    if (typeof self.retrieveData !== 'function') {
        throw `DataFetcher DEFINED WITHOUT METHOD retrieveData: ${JSON.stringify(this)}`;
    }

    if (self.parameters) {
        if (self.parameters.constructor !== Array) {
            throw `DataFetcher ${self.name} PROPERTY parameters IS SET BUT NOT AN ARRAY. CHECK THE DEFINITION : ${JSON.stringify(self)}`;
        }
    }

    return self.retrieveData.apply(self, self.parameters);
};

DataFetcher.prototype.getName = function () {
    return this.name;
};

DataFetcher.prototype.setStateMachine = function (stateMachine) {
    if (!stateMachine) {
        throw 'MISSING PARAMETER stateMachine';
    }

    this.stateMachine = stateMachine;
};

module.exports = function (properties, stateMachine, state) {
    return new DataFetcher(properties, stateMachine, state);
};