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
exports.listeningTimedPromise = function (event, messageId, deviceAddress, timeout, timeoutMessage) {
    const eb = require('byteballcore/event_bus');

    const uniqueInternalEvent = `internal.dagcoin.${this.nextId()}`;

    const listener = function () {
        const message = arguments[0];
        const fromAddress = arguments[1];

        // emit parameters:
        // 1. internal event name
        // 2. resolution value
        // 3. error

        if (!message) {
            console.error(`MISSING message IN LISTENED EVENT ${event}`);
            return;
        }

        if (!fromAddress) {
            console.error(`MISSING fromAddress IN LISTENED EVENT ${event}`);
            return;
        }

        if (fromAddress !== deviceAddress) {
            console.log(`IGNORING event IN LISTENER OF ${event}: NOT FOR ME (DIFFERENT DEVICE ID)`);
            return;
        }

        if (message.id !== messageId) {
            console.log(`IGNORING event IN LISTENER OF ${event}: NOT FOR ME (DIFFERENT MESSAGE ID)`);
            return;
        }

        if (message.messageBody.error) {
            eb.emit(uniqueInternalEvent, null, `${event} LISTENER ERROR: ${message.messageBody.error}`);
            return;
        }

        eb.emit(uniqueInternalEvent, message.messageBody, null);
    };

    eb.on(event, listener);

    const promise = new Promise((resolve, reject) => {
        eb.once(uniqueInternalEvent, (resolutionValue, error) => {
            if (error) {
                reject(error);
            } else {
                resolve(resolutionValue);
            }
        });
    });

    return this.timedPromise(promise, timeout, timeoutMessage)
        .then(
            (args) => {
                console.log(`REMOVING THE LISTENER FROM ${event}, VALUE RECEIVED: ${JSON.stringify(args)}`);
                eb.removeListener(event, listener);
                return Promise.resolve(args);
            },
            (err) => {
                console.log(`REMOVING THE LISTENER FROM ${event}, ERROR RECEIVED: ${err}`);
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

exports.PromiseEnqueuer = function (name, execute, minimumDelay, repeatUntilSuccess) {
    return {
        name,
        promiseQueue: [],
        minimumDelay,
        execute,
        repeatUntilSuccess,
        promiseId: 0,
        nextPromiseId: function () {
            const nextPromiseId = this.promiseId;
            this.promiseId += 1;
            return nextPromiseId;
        },
        enqueue: function () {
            const resolver = {};

            const promise = new Promise((resolve, reject) => {
                resolver.processResult = (result) => {
                    resolve(result);
                };
                resolver.onError = (error) => {
                    reject(error);
                }
            });

            this.promiseQueue.push({arguments, resolver, promiseId: this.nextPromiseId()});

            this.resolve();

            return promise;
        },
        free: function () {
            delete this.executing;
            this.resolve();
        },
        lock: function () {
            if (this.promiseQueue.length === 0) {
                console.log(`PROMISE QUEUE ${this.name} IS FREE`);
                return;
            }

            if(this.executing) {
                console.log(`PROMISE QUEUE ${this.name} IS BUSY`);
                return;
            }

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

            console.log(`PROMISE QUEUE ${self.name} EXECUTING NOW ${promiseDefinition.promiseId}`);

            if (parameters) {
                promise = self.execute(...parameters);
            } else {
                promise = self.execute();
            }

            return promise.then(
                (result) => {
                    resolver.processResult(result);
                    return Promise.resolve();
                },
                (error) => {
                    if (!self.repeatUntilSuccess) {
                        resolver.onError(error);
                    } else {
                        console.log(`WHILE RESOLVING A SEQUENTIAL PROMISE: ${error}. `);
                        this.promiseQueue.push(promiseDefinition);
                    }
                    return Promise.resolve();
                }
            ).then(() => {
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