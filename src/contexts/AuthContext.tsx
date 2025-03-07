import React, { createContext, useContext, useReducer, useMemo, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { EventRegister } from 'react-native-event-listeners';
import { Driver } from '@fleetbase/sdk';
import { later, isArray, navigatorConfig } from '../utils';
import useStorage, { storage } from '../hooks/use-storage';
import useFleetbase, { adapter } from '../hooks/use-fleetbase';
import { useLanguage } from './LanguageContext';
import { useNotification } from './NotificationContext';
import { LoginManager as FacebookLoginManager } from 'react-native-fbsdk-next';

const AuthContext = createContext();

const authReducer = (state, action) => {
    switch (action.type) {
        case 'RESTORE_SESSION':
            return { ...state, driver: action.driver };
        case 'LOGIN':
            return { ...state, phone: action.phone, isSendingCode: action.isSendingCode ?? false };
        case 'CREATING_ACCOUNT':
            return { ...state, phone: action.phone, isSendingCode: action.isSendingCode ?? false };
        case 'VERIFY':
            return { ...state, driver: action.driver, isVerifyingCode: action.isVerifyingCode ?? false };
        case 'LOGOUT':
            return { ...state, driver: null, phone: null, isSigningOut: action.isSigningOut ?? false };
        case 'START_UPDATE':
            return { ...state, driver: action.driver, isUpdating: action.isUpdating ?? true };
        case 'END_UPDATE':
            return { ...state, driver: action.driver, isUpdating: action.isUpdating ?? false };
        default:
            return state;
    }
};

export const AuthProvider = ({ children }) => {
    const { fleetbase } = useFleetbase();
    const { setLocale } = useLanguage();
    const { deviceToken } = useNotification();
    const [storedDriver, setStoredDriver] = useStorage('driver');
    const [authToken, setAuthToken] = useStorage('_driver_token');
    const [state, dispatch] = useReducer(authReducer, {
        isSendingCode: false,
        isVerifyingCode: false,
        isSigningOut: false,
        isUpdating: false,
        driver: storedDriver ? new Driver(storedDriver, adapter) : null,
        phone: null,
    });

    // Restore session on app load
    useEffect(() => {
        if (storedDriver) {
            if (storedDriver.token) {
                setAuthToken(storedDriver.token);
            }
            dispatch({ type: 'RESTORE_SESSION', driver: new Driver(storedDriver, adapter) });
        } else {
            dispatch({ type: 'RESTORE_SESSION', driver: null });
        }
    }, [storedDriver, fleetbase]);

    const setDriver = useCallback(
        (newDriver) => {
            if (!newDriver) {
                setStoredDriver(null);
                EventRegister.emit('driver.updated', null);
                return;
            }

            const driverInstance = newDriver instanceof Driver ? newDriver : new Driver(newDriver, adapter);

            // Restore driver token if needed
            if (!driverInstance.token && storage.getString('_driver_token')) {
                driverInstance.setAttribute('token', storage.getString('_driver_token'));
            }

            setStoredDriver(driverInstance.serialize());
            EventRegister.emit('driver.updated', driverInstance);
        },
        [fleetbase, setStoredDriver]
    );

    // Track driver location
    const trackDriverLocation = async (location) => {
        try {
            const driver = await state.driver.update({ place: location.id });
            setDriver(driver);
        } catch (err) {
            throw err;
        }
    };

    // Update driver meta attributes
    const updateDriverMeta = async (newMeta = {}) => {
        const meta = { ...state.driver.getAttribute('meta'), ...newMeta };
        try {
            const driver = await state.driver.update({ meta });
            setDriver(driver);
            return driver;
        } catch (err) {
            throw err;
        }
    };

    // Update driver meta attributes
    const updateDriver = async (data = {}) => {
        try {
            dispatch({ type: 'START_UPDATE', driver: state.driver, isUpdating: true });
            const driver = await state.driver.update({ ...data });
            setDriver(driver);
            dispatch({ type: 'END_UPDATE', driver, isUpdating: false });
            return driver;
        } catch (err) {
            dispatch({ type: 'END_UPDATE', driver: state.driver, isUpdating: false });
            throw err;
        }
    };

    // Toggle driver online status
    const toggleOnline = async (online = null) => {
        online = online === null ? !state.driver.isOnline : online;
        try {
            const driver = updateDriver({ online });
            return driver;
        } catch (err) {
            throw err;
        }
    };

    // Register driver's device and platform
    const syncDevice = async (driver, token) => {
        try {
            await driver.syncDevice(token, Platform.OS);
        } catch (err) {
            throw err;
        }
    };

    // Register current state driver's device and platform
    const registerDevice = async (token) => {
        try {
            await state.driver.syncDevice(token, Platform.OS);
        } catch (err) {
            throw err;
        }
    };

    // Create Account: Send verification code
    const requestCreationCode = useCallback(
        async (phone, method = 'sms') => {
            dispatch({ type: 'CREATING_ACCOUNT', phone, isSendingCode: true });
            try {
                await fleetbase.drivers.requestCreationCode(phone, method);
                dispatch({ type: 'CREATING_ACCOUNT', phone, isSendingCode: false });
            } catch (error) {
                console.error('[AuthContext] Account creation verification failed:', error);
                throw error;
            } finally {
                dispatch({ type: 'CREATING_ACCOUNT', phone, isSendingCode: false });
            }
        },
        [fleetbase]
    );

    // Create Account: Verify Code
    const verifyAccountCreation = useCallback(
        async (phone, code, attributes = {}) => {
            dispatch({ type: 'VERIFY', isVerifyingCode: true });
            try {
                const driver = await fleetbase.drivers.create(phone, code, attributes);
                createDriverSession(driver);
                dispatch({ type: 'VERIFY', driver });
            } catch (error) {
                console.error('[AuthContext] Account creation verification failed:', error);
                throw error;
            } finally {
                dispatch({ type: 'VERIFY', isVerifyingCode: false });
            }
        },
        [fleetbase]
    );

    // Login: Send verification code
    const login = useCallback(
        async (phone) => {
            dispatch({ type: 'LOGIN', phone, isSendingCode: true });
            try {
                await fleetbase.drivers.login(phone);
                dispatch({ type: 'LOGIN', phone, isSendingCode: false });
            } catch (error) {
                console.error('[AuthContext] Login failed:', error);
                throw error;
            } finally {
                dispatch({ type: 'LOGIN', phone, isSendingCode: false });
            }
        },
        [fleetbase]
    );

    // Remove local session data
    const clearSessionData = () => {
        storage.removeItem('_driver_token');

        // If logged in with facebook
        FacebookLoginManager.logOut();
    };

    // Verify code
    const verifyCode = useCallback(
        async (code) => {
            dispatch({ type: 'VERIFY', isVerifyingCode: true });
            try {
                const driver = await fleetbase.drivers.verifyCode(state.phone, code);
                createDriverSession(driver);
                dispatch({ type: 'VERIFY', driver });
            } catch (error) {
                console.error('[AuthContext] Code verification failed:', error);
                throw error;
            } finally {
                dispatch({ type: 'VERIFY', isVerifyingCode: false });
            }
        },
        [fleetbase, state.phone, setDriver]
    );

    // Create a session from driver data/JSON
    const createDriverSession = async (driver, callback = null) => {
        clearSessionData();
        // setDriverDefaultLocation(driver);
        setDriver(driver);
        setAuthToken('_driver_token', driver.token);

        // run a callback with the driver instance
        const instance = new Driver(driver, adapter);
        if (typeof callback === 'function') {
            callback(instance);
        }

        // Sync the driver device
        if (deviceToken) {
            syncDevice(instance, deviceToken);
        }

        return instance;
    };

    // Logout: Clear session
    const logout = useCallback(() => {
        setDriver(null);
        dispatch({ type: 'LOGOUT', isSigningOut: true });

        // Clear storage/ cache
        clearSessionData();

        // Reset locale
        setLocale(navigatorConfig('defaultLocale', 'en'));

        later(() => {
            dispatch({ type: 'LOGOUT', isSigningOut: false });
        });
    }, [setDriver]);

    // Memoize useful props and methods
    const value = useMemo(
        () => ({
            driver: state.driver,
            phone: state.phone,
            isSendingCode: state.isSendingCode,
            isVerifyingCode: state.isVerifyingCode,
            isAuthenticated: !!state.driver,
            isNotAuthenticated: !state.driver,
            isOnline: state.driver?.isOnline,
            isOffline: state.driver?.isOnline === false,
            isUpdating: state.isUpdating,
            updateDriverMeta,
            updateDriver,
            toggleOnline,
            clearSessionData,
            setDriver,
            login,
            verifyCode,
            logout,
            requestCreationCode,
            verifyAccountCreation,
            createDriverSession,
            syncDevice,
            registerDevice,
            authToken,
        }),
        [state, login, verifyCode, logout]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const useIsAuthenticated = () => {
    const { isAuthenticated } = useAuth();
    return isAuthenticated;
};

export const useIsNotAuthenticated = () => {
    const { isNotAuthenticated } = useAuth();
    return isNotAuthenticated;
};
