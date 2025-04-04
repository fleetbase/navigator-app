import { isResource } from '@fleetbase/sdk';
import configuration from 'config';
import { countries } from 'countries-list';
import useFleetbase from 'hooks/use-fleetbase';
import { EventRegister } from 'react-native-event-listeners';
import socketClusterClient from 'socketcluster-client';
import { getString } from './Storage';

const { emit } = EventRegister;

/**
 *  Utility class for various helper utility functions
 *
 * @export
 * @class HelperUtil
 */
export default class HelperUtil {
    /**
     * Lists an array of countries as objects.
     *
     * @static
     * @param {strine} [_country=null] ISO-2 country code
     * @return {Array}
     * @memberof HelperUtil
     */
    static listCountries(_country = null) {
        const _countries = Object.values(countries);
        const _codes = Object.keys(countries);
        const _list = [];

        for (let i = 0; i < _countries.length; i++) {
            const country = _countries[i];

            _list.push({
                ...country,
                iso2: _codes[i],
            });
        }

        _list.sort((a, b) => a.name.localeCompare(b.name));

        if (_country !== null) {
            // eslint-disable-next-line radix
            return _list.find((c) => c.iso2 === _country || parseInt(c.phone) === parseInt(_country));
        }

        return _list;
    }

    /**
     * Handle mutation of places Collection, either remove, add, or update in collection.
     * Allows user to send callback after mutation.
     *
     * @static
     * @param {*} places
     * @param {*} place
     * @param {*} cb
     * @return {*}
     * @memberof HelperUtil
     */
    static mutatePlaces(places, place, cb) {
        if (!HelperUtil.isArray(places)) {
            return;
        }

        const index = places.findIndex((p) => p.id === place.id);

        if (place.isDeleted) {
            places = places.removeAt(index);
        } else if (index === -1) {
            places = places.pushObject(place);
        } else {
            places = places.replaceAt(index, place);
        }

        if (typeof cb === 'function') {
            cb(places);
        }
    }

    /**
     * Determines if argument is array.
     *
     * @static
     * @param {array} arr
     * @return {boolean}
     * @memberof HelperUtil
     */
    static isArray(arr) {
        return Array.isArray(arr);
    }

    /**
     * Checks if NavigatorApp has required keys to run.
     *
     * @static
     * @return {boolean}
     * @memberof HelperUtil
     */
    static hasRequiredKeys() {
        return 'FLEETBASE_KEY' in configuration;
    }

    /**
     * Determines if index passed is the last index in an array.
     *
     * @static
     * @param {array} [array=[]]
     * @param {number} [index=0]
     * @return {boolean}
     * @memberof HelperUtil
     */
    static isLastIndex(array = [], index = 0) {
        return array.length - 1 === index;
    }

    /**
     * Strips html from a string.
     *
     * @static
     * @param {string} [html='']
     * @return {string}
     * @memberof HelperUtil
     */
    static stripHtml(html = '') {
        if (typeof html === 'string') {
            return html.replace(/<[^>]*>?/gm, '');
        }

        return html;
    }

    /**
     * Strips iframe tags from a string.
     *
     * @static
     * @param {string} [html='']
     * @return {string}
     * @memberof HelperUtil
     */
    static stripIframeTags(html = '') {
        if (typeof html === 'string') {
            return html.replace(/\<iframe (.*)(\<\/iframe\>|\/>)/gm, '');
        }

        return html;
    }

    /**
     * Determines if device is android.
     *
     * @static
     * @return {boolean}
     * @memberof HelperUtil
     */
    static isAndroid() {
        return Platform.OS === 'android';
    }

    /**
     * Determines if device is iphone/ios or apple device.
     *
     * @static
     * @return {boolean}
     * @memberof HelperUtil
     */
    static isApple() {
        return Platform.OS === 'ios';
    }

    /**
     * Determines if argument is null or undefined.
     *
     * @static
     * @param {*} mixed
     * @return {boolean}
     * @memberof HelperUtil
     */
    static isVoid(mixed) {
        return mixed === undefined || mixed === null;
    }

    /**
     * Determines if argument is empty of elements.
     *
     * @static
     * @param {*} mixed
     * @return {boolean}
     * @memberof HelperUtil
     */
    static isEmpty(obj) {
        const none = obj === null || obj === undefined;
        if (none) {
            return none;
        }

        if (typeof obj.size === 'number') {
            return !obj.size;
        }

        const objectType = typeof obj;

        if (objectType === 'object') {
            const { size } = obj;
            if (typeof size === 'number') {
                return !size;
            }
        }

        if (typeof obj.length === 'number' && objectType !== 'function') {
            return !obj.length;
        }

        if (objectType === 'object') {
            const { length } = obj;
            if (typeof length === 'number') {
                return !length;
            }
        }

        return false;
    }

    /**
     * Determines if argument has valid resource properties.
     *
     * @static
     * @param {*} mixed
     * @return {boolean}
     * @memberof HelperUtil
     */
    static hasResouceProperties(mixed) {
        return !HelperUtil.isVoid(mixed) && !HelperUtil.isVoid(mixed?.id) && typeof mixed?.serialize === 'function' && typeof mixed?.resource === 'string';
    }

    /**
     * Universal error logger
     *
     * @static
     * @param {Error|string} error
     * @param {null|string} message
     * @return {void}
     * @memberof HelperUtil
     */
    static logError(error, message) {
        if (error instanceof Error) {
            return console.log(`[ ${message ?? error.message} ]`, error);
        }

        if (typeof error === 'string') {
            let output = `[ ${error} ]`;

            if (message) {
                output += ` - [ ${message} ]`;
            }

            return console.log(output);
        }

        return console.log(`[ ${message ?? 'Error Logged!'} ]`, error);
    }

    /**
     * Returns a function, that, as long as it continues to be invoked, will not
     * be triggered. The function will be called after it stops being called for
     * N milliseconds. If `immediate` is passed, trigger the function on the
     * leading edge, instead of the trailing.
     *
     * @static
     * @param {Function} callback
     * @param {Number} wait in ms (`300`)
     * @param {Boolean} immediate default false
     * @memberof HelperUtil
     */
    static debounce(callback, wait = 300, immediate = false) {
        let timeout;

        return function () {
            const context = this,
                args = arguments;

            const later = function () {
                timeout = null;
                if (!immediate) {
                    callback.apply(context, args);
                }
            };

            const callNow = immediate && !timeout;

            clearTimeout(timeout);

            timeout = setTimeout(later, wait);

            if (callNow) {
                callback.apply(context, args);
            }
        };
    }

    /**
     * Deep get a value from a target provided it's path.
     *
     * @static
     * @param {Mixed} object
     * @param {String} path
     * @param {Mixed} defaultValue
     * @return {Mixed}
     * @memberof HelperUtil
     */
    static deepGet(object, path, defaultValue = null) {
        let current = object;

        const type = typeof object;
        const isObject = type === 'object';
        const isFunction = type === 'function';
        const isArray = Array.isArray(object);

        const pathType = typeof path;
        const pathIsString = pathType === 'string';
        const pathIsDotted = pathIsString && path.includes('.');
        const pathArray = pathIsDotted ? path.split('.') : [path];

        if (isArray || isObject) {
            for (let i = 0; i < pathArray.length; i++) {
                if (current && current[pathArray[i]] === undefined) {
                    return null;
                } else if (current) {
                    current = current[pathArray[i]];

                    // if is resource then return get on it's attributes
                    if (isResource(current) && pathArray[i + 1] !== undefined) {
                        const newPath = pathArray.slice(i + 1).join('.');

                        return HelperUtil.deepGet(current.attributes, newPath);
                    }

                    // resolve functions and continue
                    if (typeof current === 'function') {
                        const newPath = pathArray.slice(i + 1).join('.');
                        return HelperUtil.getResolved(current, newPath);
                    }
                }
            }
            return current;
        }

        if (isFunction) {
            return HelperUtil.getResolved(object, path);
        }

        return defaultValue;
    }

    /**
     * Returns the value of a resolved function.
     *
     * @static
     * @param {*} func
     * @param {*} path
     * @memberof HelperUtil
     */
    static getResolved = (func, path) => {
        const resolved = func();
        return Array.isArray(resolved) || typeof resolved === 'object' ? HelperUtil.deepGet(resolved, path) : null;
    };

    /**
     * Checks if variable is falsy
     *
     * @static
     * @param {*} mixed
     * @memberof HelperUtil
     */
    static isFalsy = (mixed) => {
        return !mixed === true || mixed === '0';
    };

    /**
     * Returns a configuration value provided it's path.
     *
     * @static
     * @param {String} path
     * @param {mixes} defaultValue
     * @return {Mixed}
     * @memberof HelperUtil
     */
    static config(path, defaultValue = null) {
        let value = HelperUtil.deepGet(configuration, path);

        if (value === undefined) {
            return defaultValue;
        }

        return value;
    }

    /**
     * Returns the sum of array or parameters passed.
     *
     * @static
     * @param {Array} sum
     * @return {Integer}
     * @memberof HelperUtil
     */
    static sum(numbers = []) {
        if (!isArray(numbers)) {
            numbers = [...arguments];
        }

        return numbers.reduce((sum, number) => sum + number, 0);
    }

    /**
     * Takes a tailwind color based classname property and returns it's rgb color value
     *
     * @static
     * @param {String} string
     * @return {String}
     * @memberof HelperUtil
     */
    static getColorCode(string, defaultColorCode = '#ffffff') {
        const styles = require('../../styles.json');
        let property = styles[string] ?? null;

        if (property === null) {
            // getColorCode('gray-900');
            property = styles[`text-${string}`] ?? null;
        }

        if (property === null) {
            return defaultColorCode;
        }

        const rgba2rgb = (rgbaString) => {
            const decimals = rgbaString.replace('rgba', 'rgb').split(',');
            decimals.pop();

            return decimals.join(',') + ')';
        };

        if (property) {
            if (string.startsWith('bg-')) {
                // get background color value
                return rgba2rgb(property?.backgroundColor);
            }

            if (string.startsWith('text-')) {
                // get text color value
                return rgba2rgb(property?.color);
            }
        }

        return null;
    }

    static toBoolean(value) {
        switch (value) {
            case 'true':
            case '1':
            case 1:
            case true:
                return true;
            case 'false':
            case '0':
            case 0:
            case false:
            case null:
            case undefined:
            case '':
                return false;
            default:
                return false;
        }
    }

    static async createSocketAndListen(channelId, callback) {
        let hostname = getString('_SOCKETCLUSTER_HOST');
        let port = getString('_SOCKETCLUSTER_PORT');

        // IF no hostname set from instance link use env
        if (!hostname) {
            hostname = HelperUtil.config('SOCKETCLUSTER_HOST', 'socket.fleetbase.io');
        }

        // IF no port set from instance link use env
        if (!port) {
            port = HelperUtil.config('SOCKETCLUSTER_PORT', 8000);
        }

        // Create socket connection config
        const socketConnectionConfig = {
            hostname,
            path: HelperUtil.config('SOCKETCLUSTER_PATH', '/socketcluster/'),
            secure: toBoolean(HelperUtil.config('SOCKETCLUSTER_SECURE', false)),
            port,
            autoConnect: true,
            autoReconnect: true,
        };

        console.log('Using socketcluster config', socketConnectionConfig);

        // Create socket connection
        const socket = socketClusterClient.create(socketConnectionConfig);

        // Handle socket connection errors
        const handleSocketErrors = async () => {
            const errorIterator = socket.listener('error')[Symbol.asyncIterator]();
            const processError = async () => {
                try {
                    const { value, done } = await errorIterator.next();
                    if (done) return;
                    console.warn('[Socket Error]', value);
                    return processError();
                } catch (error) {
                    console.warn('Error during error iteration:', error);
                }
            };
            processError();
        };
        handleSocketErrors();

        // Handle socket connection
        const handleSocketConnect = async () => {
            const connectIterator = socket.listener('connect')[Symbol.asyncIterator]();
            const processConnect = async () => {
                try {
                    const { value, done } = await connectIterator.next();
                    if (done) return;
                    console.log('[Socket Connected]', value);
                    return processConnect();
                } catch (error) {
                    console.warn('Error during connect iteration:', error);
                }
            };
            processConnect();
        };
        handleSocketConnect();

        try {
            // Create channel from channel id
            const channel = socket.subscribe(channelId);

            console.log('Channel subscribed!');

            // Await subscription confirmation
            console.log('Awaiting subscription confirmation...');
            await channel.listener('subscribe').once();
            console.log('Subscription confirmed!');

            console.log('Listening to channel for events now');

            const handleAsyncIteration = async (asyncIterable) => {
                console.log('[handleAsyncIteration]');
                const iterator = asyncIterable[Symbol.asyncIterator]();
                console.log('[iterator]', iterator);

                const processNext = async () => {
                    console.log('[processNext]');
                    try {
                        const { value, done } = await iterator.next();
                        console.log('[processNext done?]', done);
                        console.log('[processNext value]', JSON.stringify(value));
                        if (done) {
                            // If no more data, exit the function
                            return;
                        }

                        // Process the value
                        console.log('[processNext value]', JSON.stringify(value));
                        if (typeof callback === 'function') {
                            callback(value);
                        }

                        // Recursively process the next item
                        return processNext();
                    } catch (error) {
                        console.warn('Error during async iteration:', error);
                        // Optionally, handle the error or re-throw it
                        // throw error;
                    }
                };

                // Start processing
                return processNext();
            };

            // Start handling the async iteration for the channel
            (async () => {
                try {
                    await handleAsyncIteration(channel);
                } catch (error) {
                    console.warn('Error during async iteration:', error);
                }
            })();
        } catch (error) {
            console.warn('Error during channel subscription or handling:', error);
        }
    }

    static async listenForOrdersFromSocket(channelId, callback) {
        const fleetbase = useFleetbase();

        return HelperUtil.createSocketAndListen(channelId, ({ event, data }) => {
            if (typeof data.id === 'string' && data.id.startsWith('order')) {
                return fleetbase.orders.findRecord(data.id).then((order) => {
                    const serializedOrder = order.serialize();

                    if (typeof callback === 'function') {
                        callback(serializedOrder, event);
                    }
                });
            }
        });
    }

    static createNewOrderLocalNotificationObject(order, driver, event) {
        const isOrderAssigned = HelperUtil.deepGet(order, 'driver_assigned.id') === driver.id;
        const isAdhocOrder = !isOrderAssigned;

        let title = `📦 New Incoming Order`;
        let message = `New order assigned ${order.id}`;
        let subtitle = `Pickup at ${HelperUtil.deepGet(order, 'payload.pickup.street1')}`;

        if (isAdhocOrder) {
            message = `New order available nearby 📡`;
        }

        if (event === 'order.dispatched') {
            title = `🚀 ${order.id} was just dispatched!`;
        }

        if (event === 'order.driver_assigned') {
            title = `📋 ${order.id} was just assigned!`;
        }

        return {
            title,
            message,
            subtitle,
        };
    }

    static isObject(obj) {
        return obj && typeof obj === 'object' && Object.prototype.toString.call(obj) === '[object Object]';
    }
}

const listCountries = HelperUtil.listCountries;
const isArray = HelperUtil.isArray;
const hasRequiredKeys = HelperUtil.hasRequiredKeys;
const isLastIndex = HelperUtil.isLastIndex;
const stripHtml = HelperUtil.stripHtml;
const stripIframeTags = HelperUtil.stripIframeTags;
const isAndroid = HelperUtil.isAndroid();
const isApple = HelperUtil.isApple();
const isVoid = HelperUtil.isVoid;
const isEmpty = HelperUtil.isEmpty;
const isFalsy = HelperUtil.isFalsy;
const isObject = HelperUtil.isObject;
const logError = HelperUtil.logError;
const mutatePlaces = HelperUtil.mutatePlaces;
const debounce = HelperUtil.debounce;
const deepGet = HelperUtil.deepGet;
const config = HelperUtil.config;
const sum = HelperUtil.sum;
const getColorCode = HelperUtil.getColorCode;
const toBoolean = HelperUtil.toBoolean;
const createSocketAndListen = HelperUtil.createSocketAndListen;
const listenForOrdersFromSocket = HelperUtil.listenForOrdersFromSocket;
const createNewOrderLocalNotificationObject = HelperUtil.createNewOrderLocalNotificationObject;

export {
    config,
    createNewOrderLocalNotificationObject,
    createSocketAndListen,
    debounce,
    deepGet,
    getColorCode,
    hasRequiredKeys,
    isAndroid,
    isApple,
    isArray,
    isEmpty,
    isFalsy,
    isLastIndex,
    isObject,
    isVoid,
    listCountries,
    listenForOrdersFromSocket,
    logError,
    mutatePlaces,
    stripHtml,
    stripIframeTags,
    sum,
    toBoolean,
};
