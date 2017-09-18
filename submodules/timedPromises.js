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