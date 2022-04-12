import { EventRegister } from 'react-native-event-listeners';
import { Driver, isResource } from '@fleetbase/sdk';
import { get, set, storage, useMMKVStorage } from './Storage';
import { isVoid, logError } from './Helper';
import useFleetbase from 'hooks/use-fleetbase';

const { emit } = EventRegister;

/**
 * Driver utility class for performing actions on current driver.
 *
 * @export
 * @class Driver
 */
export default class AuthUtil {
    /**
     * Returns the current driver if authenticated, if no driver
     * then will return null.
     *
     * @static
     * @return {null|Driver}
     * @memberof AuthUtil
     */
    static get() {
        const attributes = get('driver');
        const fleetbase = useFleetbase();

        if (!attributes) {
            return null;
        }

        return new Driver(attributes, fleetbase.getAdapter());
    }

    /**
     * Update the current driver resource.
     *
     * @static
     * @param {Driver}
     * @memberof AuthUtil
     */
    static update(driver) {
        if (typeof driver?.serialize === 'function') {
            set('driver', driver.serialize());
            emit('driver.updated', driver);
        }
    }

    /**
     * Hook for retrieving current driver from state.
     *
     * @static
     * @return {Array}
     * @memberof AuthUtil
     */
    static use() {
        const [value, setValue] = useMMKVStorage('driver', storage);
        const fleetbase = useFleetbase();

        const setDriver = (driver) => {
            console.log('setDriver() - driver', driver);
            if (typeof driver?.serialize === 'function') {
                emit('driver.updated', driver);
                setValue(driver.serialize());
            } else {
                setValue(driver);
            }
        };

        if (value) {
            return [new Driver(value, fleetbase.getAdapter()), setDriver];
        }

        return [value, setDriver];
    }

    /**
     * Sync current mobile device to driver on Fleetbase.
     *
     * @static
     * @param {Driver} driver
     * @return {void}
     * @memberof AuthUtil
     */
    static syncDevice(driver = null) {
        driver = driver ?? AuthUtil.get();

        const token = get('token');

        if (typeof driver?.syncDevice === 'function' && token?.token) {
            driver.syncDevice(token).catch(logError);
        }
    }

    /**
     * Checks if driver resource is valid.
     *
     * @static
     * @param {Driver} driver
     * @return {boolean}
     * @memberof AuthUtil
     */
    static isValid(driver) {
        return isResource(driver) && !isVoid(driver.token);
    }
}

const getDriver = AuthUtil.get;
const updateDriver = AuthUtil.update;
const useDriver = AuthUtil.use;
const syncDevice = AuthUtil.syncDevice;
const isValidDriver = AuthUtil.isValid;

export { updateDriver, getDriver, useDriver, syncDevice, isValidDriver };
