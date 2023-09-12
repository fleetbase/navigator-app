import { Collection, isResource } from '@fleetbase/sdk';
import { EventRegister } from 'react-native-event-listeners';
import { countries } from 'countries-list';
import { set } from './Storage';
import { getCurrentLocation } from './Geo';
import { useNavigation } from '@react-navigation/native';
import useFleetbase from 'hooks/use-fleetbase';
import configuration from 'config';
import socketClusterClient from 'socketcluster-client';

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
     * Checks if StorefrontApp has required keys to run.
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
        // Create socket connection config
        const socketConnectionConfig = {
            hostname: '192.168.1.38', //HelperUtil.config('SOCKETCLUSTER_HOST', 'localhost'),
            path: HelperUtil.config('SOCKETCLUSTER_PATH', '/socketcluster/'),
            secure: toBoolean(HelperUtil.config('SOCKETCLUSTER_SECURE', false)),
            port: HelperUtil.config('SOCKETCLUSTER_PORT', 38000),
            autoConnect: true,
            autoReconnect: true,
        };

        // Create socket connection
        const socket = socketClusterClient.create(socketConnectionConfig);

        // Listen for socket connection errors
        (async () => {
            // eslint-disable-next-line no-unused-vars
            for await (let event of socket.listener('error')) {
                console.log('[Socket Error]', event);
            }
        })();

        // Listen for socket connection
        (async () => {
            // eslint-disable-next-line no-unused-vars
            for await (let event of socket.listener('connect')) {
                console.log('[Socket Connected]', event);
            }
        })();

        // create channel from channel id
        const channel = socket.subscribe(channelId);

        // subscribe to channel
        await channel.listener('subscribe').once();

        // listen to incoming data with callback
        (async () => {
            for await (let output of channel) {
                if (typeof callback === 'function') {
                    callback(output);
                }
            }
        })();
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

    static createNewOrderLocalNotificationObject(order, driver) {
        const isOrderAssigned = HelperUtil.deepGet(order, 'driver_assigned.id') === driver.id;
        const isAdhocOrder = !isOrderAssigned;

        let title = `📦 New Incoming Order`;
        let message = `New order assigned ${order.id}`;
        let subtitle = `Pickup at ${HelperUtil.deepGet(order, 'payload.pickup.street1')}`;

        if (isAdhocOrder) {
            message = `New order available nearby 📡`;
        }

        return {
            title,
            message,
            subtitle
        };
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
    listCountries,
    isArray,
    hasRequiredKeys,
    isLastIndex,
    stripHtml,
    stripIframeTags,
    isAndroid,
    isApple,
    isVoid,
    isEmpty,
    isFalsy,
    logError,
    mutatePlaces,
    debounce,
    deepGet,
    config,
    sum,
    getColorCode,
    toBoolean,
    createSocketAndListen,
    listenForOrdersFromSocket,
    createNewOrderLocalNotificationObject,
};
