'use strict';
exports.FOREVER = -1;

exports.timedPromise = function (promise, timeout, timeoutMessage) {
    let timeoutId = null;
    let message = timeoutMessage;

    if (!message) {
        message = 'TIMEOUT WHILE WAITING FOR THE PROMISE TO RESOLVE';
    }

    return Promise.race([
        promise,
        new Promise((resolve, reject) => {
            timeoutId = setTimeout(() => {
                reject(message);
            }, timeout);
        })
    ]).then(
        (result) => {
            clearTimeout(timeoutId);
            return Promise.resolve(result);
        }, (error) => {
            clearTimeout(timeoutId);
            return Promise.reject(error);
        }
    );
};

/**
 * Takes a promise, provides it with a timeout and repeats it when the timeout fires.
 * Gives up after several attempts
 * @param promise A promise to be fulfilled before a timeout.
 * @param timeout How long the promise can wait before being rejected and, possibly, reattempted.
 * @param times How many times the promsie should be attempted? promiseService.FOREVER to try forever.
 * @param timeoutMessages A JSON structure with timeoutMessage and finalTimeoutMessage
 * @returns {Promise.<T>|*}
 */
exports.repeatedTimedPromise = function (promise, timeout, times, timeoutMessages) {
    let finalTimeoutMessage = 'NO MORE ATTEMPTS';
    let timeoutMessage = null;

    if (timeoutMessages) {
        finalTimeoutMessage = timeoutMessages.finalTimeoutMessage;
        timeoutMessage = timeoutMessages.timeoutMessage;
    }

    if (!finalTimeoutMessage) {
        finalTimeoutMessage = 'NO MORE ATTEMPTS';
    }

    return this.timedPromise(promise, timeout, timeoutMessage).catch((error) => {
        if (times > 0 || times === this.FOREVER) {
            console.log(`${error} ... TRYING AGAIN`);
            return this.repeatedTimedPromise(promise, timeout, times - 1, timeoutMessages);
        }

        return Promise.reject(finalTimeoutMessage);
    });
};

exports.counter = 0;

exports.nextId = function () {
    const id = this.counter;
    this.counter += 1;
    return id;
};

/**
 * Listens to a generic event waiting for a certain instance of it with specific attributes analysed in the condition.
 * Returns a promise that is rejected after a timeout.
 * @param event An bus event name to listen to. Can be a generic event issue many times.
 * @param condition A function that takes the event parameters as input and outputs a true value if the
 * event is the one expected (true in the simplest case, any complex non-false value in others) to be returned by the promise
 * when it resolves positively.
 * The expectation is based on the event parameters (i.e.: some id or other properties of the event).
 * Be careful:
 * * 0 is false
 * * false is false
 * * null is false
 * * 1 is true
 * * an array or an object are true
 * If you need to return a false value which means true you have to wrap it with a true wrapper
 * * i.e.: return {'result': false}
 * @param timeout A timeout after which the promise naturally expires.
 * @param timeoutMessage An error message to be returned by reject when the timeout is met.
 */
exports.listeningTimedPromise = function (event, condition, timeout, timeoutMessage) {
    const eb = require('byteballcore/event_bus');

    const uniqueInternalEvent = `internal.dagcoin.${this.nextId()}`;

    const listener = function () {
        for( let a in arguments) {
            console.log(`ARGUMENT ${a}: ${arguments[a]}`);
        }

        const resolutionValue = condition(...arguments);

        if (!resolutionValue) {
            console.log(`IGNORING USELESS EVENT ${event}`);
            return;
        }

        eb.emit(uniqueInternalEvent, resolutionValue);
    };

    eb.on(event, listener);

    const promise = new Promise((resolve) => {
        eb.once(uniqueInternalEvent, resolve);
    });

    return this.timedPromise(promise, timeout, timeoutMessage)
        .then(
            (args) => {
                console.log(`REMOVING THE LISTENER ${listener} FROM ${event}`);
                eb.removeListener(event, listener);
                return Promise.resolve(args);
            },
            (err) => {
                console.log(`REMOVING THE LISTENER ${listener} FROM ${event}`);
                eb.removeListener(event, listener);
                return Promise.reject(err);
            }
        );
};

/**
 * Calls the same promise-returning method on and on every sleep time.
 * @param tag An identifier for logging.
 * @param sleepTime Time to sleep after a method execution (millis)
 * @param method The method. Can be followed by optional parameters
 */
exports.loopMethod = function (tag, sleepTime, method) {
    const self = this;

    const methodParams = Array.from(arguments).slice(3);

    method(...methodParams).then(
        () => {
            setTimeout(() => {
                self.loopMethod(tag, sleepTime, method, ...methodParams);
            }, sleepTime);
        },
        (err) => {
            console.log(`ERROR WITH PROMISE LOOP ${tag}: ${err}`);
            setTimeout(() => {
                self.loopMethod(tag, sleepTime, method, ...methodParams);
            }, sleepTime);
        }
    );
};

exports.PromiseEnqueuer = function (execute, minimumDelay) {
    return {
        promiseQueue: [],
        minimumDelay,
        execute,
        enqueue: function () {
            const resolver = {};

            const promise = new Promise((resolve) => {
                resolver.processResult = (result) => {
                    resolve(result);
                }
            });

            this.promiseQueue.push({arguments, resolver});

            this.resolve();

            return promise;
        },
        free: function () {
            delete this.executing;
            this.resolve();
        },
        lock: function () {
            if (this.promiseQueue.length === 0) {
                console.log('FREE');
                return;
            }

            if(this.executing) {
                console.log('BUSY');
                return;
            }

            console.log('EXECUTING');
            this.executing = true;

            //console.log(this.promiseQueue[this.promiseQueue.length - 1]);
            return this.promiseQueue.shift();
        },
        resolve: function () {
            const self = this;

            const promiseDefinition = self.lock();

            if (!promiseDefinition) {
                return;
            }

            const parameters = promiseDefinition.arguments;
            const resolver = promiseDefinition.resolver;

            let promise = null;

            if (parameters) {
                promise = self.execute(...parameters);
            } else {
                promise = self.execute();
            }

            return promise.then((result) =>{
                resolver.processResult(result);

                if(!self.minimumDelay) {
                    self.free();
                } else {
                    console.log(`STARTING TO WAIT ... THERE IS A DELAY OF ${self.minimumDelay} ms`);
                    setTimeout(() => {
                        console.log('MINIMUM DELAY EXPIRED');
                        self.free()
                    }, minimumDelay);
                }
            });
        }
    };
};