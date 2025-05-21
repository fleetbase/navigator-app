import React, { createContext, useContext, useReducer, useMemo, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { EventRegister } from 'react-native-event-listeners';
import { Driver } from '@fleetbase/sdk';
import { later, isArray, navigatorConfig } from '../utils';
import useStorage, { storage } from '../hooks/use-storage';
import useFleetbase from '../hooks/use-fleetbase';
import { useLanguage } from './LanguageContext';
import { useNotification } from './NotificationContext';
import { LoginManager as FacebookLoginManager } from 'react-native-fbsdk-next';

const AuthContext = createContext();

const authReducer = (state, action) => {
    switch (action.type) {
        case 'RESTORE_SESSION':
            return { ...state, driver: action.driver };
        case 'LOGIN':
            return { ...state, phone: action.phone, isSendingCode: action.isSendingCode ?? false, loginMethod: action.loginMethod ?? 'sms' };
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
    const { fleetbase, adapter } = useFleetbase();
    const { setLocale } = useLanguage();
    const { deviceToken } = useNotification();
    const [storedDriver, setStoredDriver] = useStorage('driver');
    const [organizations, setOrganizations] = useStorage('organizations', []);
    const [authToken, setAuthToken] = useStorage('_driver_token');
    const [state, dispatch] = useReducer(authReducer, {
        isSendingCode: false,
        isVerifyingCode: false,
        isSigningOut: false,
        isUpdating: false,
        loginMethod: 'sms',
        driver: storedDriver ? new Driver(storedDriver, adapter) : null,
        phone: null,
    });
    const organizationsLoadedRef = useRef(false);
    const loadOrganizationsPromiseRef = useRef();

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

        // Load organizations once
        if (organizationsLoadedRef && organizationsLoadedRef.current === false) {
            loadOrganizations();
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
    const trackDriverLocation = useCallback(
        async (location) => {
            try {
                const driver = await state.driver.update({ place: location.id });
                setDriver(driver);
            } catch (err) {
                throw err;
            }
        },
        [state.driver]
    );

    // Reload the driver resource
    const reloadDriver = useCallback(
        async (data = {}) => {
            try {
                const driver = await state.driver.reload();
                setDriver(driver);
            } catch (err) {
                throw err;
            }
        },
        [state.driver]
    );

    // Track driver position and other position related data
    const trackDriver = useCallback(
        async (data = {}) => {
            try {
                const driver = await state.driver.track(data);
                setDriver(driver);
            } catch (err) {
                throw err;
            }
        },
        [state.driver]
    );

    // Update driver meta attributes
    const updateDriverMeta = useCallback(
        async (newMeta = {}) => {
            const meta = { ...state.driver.getAttribute('meta'), ...newMeta };
            try {
                const driver = await state.driver.update({ meta });
                setDriver(driver);
                return driver;
            } catch (err) {
                throw err;
            }
        },
        [state.driver]
    );

    // Update driver meta attributes
    const updateDriver = useCallback(
        async (data = {}) => {
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
        },
        [state.driver]
    );

    // Toggle driver online status
    const toggleOnline = useCallback(
        async (online = null) => {
            if (!adapter) return;

            online = online === null ? !state.driver.isOnline : online;

            try {
                const driver = await adapter.post(`drivers/${state.driver.id}/toggle-online`, { online });
                setDriver(driver);

                return driver;
            } catch (err) {
                throw err;
            }
        },
        [state.driver, adapter]
    );

    // Register driver's device and platform
    const syncDevice = async (driver, token) => {
        try {
            await driver.syncDevice({ token, platform: Platform.OS });
        } catch (err) {
            throw err;
        }
    };

    // Register current state driver's device and platform
    const registerDevice = async (token) => {
        try {
            await syncDevice(state.driver, token);
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
                console.warn('[AuthContext] Account creation verification failed:', error);
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
                console.warn('[AuthContext] Account creation verification failed:', error);
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
                const { method } = await fleetbase.drivers.login(phone);
                dispatch({ type: 'LOGIN', phone, isSendingCode: false, loginMethod: method ?? 'sms' });
            } catch (error) {
                dispatch({ type: 'LOGIN', phone, isSendingCode: false });
                console.warn('[AuthContext] Login failed:', error);
                throw error;
            }
        },
        [fleetbase]
    );

    // Remove local session data
    const clearSessionData = () => {
        storage.removeItem('_driver_token');
        storage.removeItem('organizations');
        storage.removeItem('driver');

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
                dispatch({ type: 'VERIFY', driver, isVerifyingCode: false });
            } catch (error) {
                console.warn('[AuthContext] Code verification failed:', error);
                dispatch({ type: 'VERIFY', isVerifyingCode: false });
                throw error;
            }
        },
        [fleetbase, state.phone, setDriver]
    );

    // Create a session from driver data/JSON
    const createDriverSession = async (driver, callback = null) => {
        clearSessionData();
        // setDriverDefaultLocation(driver);
        setDriver(driver);
        setAuthToken(driver.token);

        // run a callback with the driver instance
        const instance = new Driver(driver, adapter);
        if (typeof callback === 'function') {
            callback(instance);
        }

        // Sync the driver device
        if (deviceToken) {
            syncDevice(instance, deviceToken);
        }

        organizationsLoadedRef.current = false;
        loadOrganizationsPromiseRef.current = null;

        return instance;
    };

    // Load organizations driver belongs to
    const loadOrganizations = useCallback(async () => {
        if (!state.driver || loadOrganizationsPromiseRef.current) return;

        try {
            loadOrganizationsPromiseRef.current = state.driver.listOrganizations();
            const organizations = await loadOrganizationsPromiseRef.current;
            console.log('[loadOrganizations #organizations]', organizations);
            setOrganizations(organizations.map((n) => n.serialize()));
        } catch (err) {
            console.warn('Error trying to load driver organizations:', err);
        } finally {
            organizationsLoadedRef.current = true;
            loadOrganizationsPromiseRef.current = null;
        }
    }, [state.driver]);

    // Load organizations driver belongs to
    const switchOrganization = useCallback(
        async (organization) => {
            if (!adapter) return;

            try {
                const { driver } = await adapter.post(`drivers/${state.driver.id}/switch-organization`, { next: organization.id });
                console.log('[switchOrganization #driver]', driver);
                console.log('[switchOrganization #driver.token]', driver.token);
                createDriverSession(driver);
            } catch (err) {
                console.warn('Error trying to switch driver organization:', err);
            }
        },
        [adapter, state.driver]
    );

    // Load organizations driver belongs to
    const getCurrentOrganization = useCallback(async () => {
        if (!state.driver) return;

        try {
            const currentOrganization = await state.driver.currentOrganization();
            return currentOrganization;
        } catch (err) {
            console.warn('Error trying fetch drivers current organization:', err);
        }
    }, [state.driver]);

    // Logout: Clear session
    const logout = useCallback(() => {
        dispatch({ type: 'LOGOUT', isSigningOut: true });

        // Remove driver session
        setDriver(null);

        // Clear storage/ cache
        clearSessionData();

        // Reset locale
        setLocale(navigatorConfig('defaultLocale', 'en'));

        later(() => {
            dispatch({ type: 'LOGOUT', isSigningOut: false });
        });
    }, [setDriver]);

    // // Sync device token if it changes
    // // Test on IOS before adding
    // useEffect(() => {
    //     if (deviceToken && state.driver) {
    //         syncDevice(state.driver, deviceToken);
    //     }
    // }, [deviceToken, state.driver]);

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
            loginMethod: state.loginMethod,
            updateDriverMeta,
            updateDriver,
            organizations,
            loadOrganizations,
            switchOrganization,
            getCurrentOrganization,
            reloadDriver,
            trackDriver,
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
        [
            state,
            login,
            verifyCode,
            logout,
            loadOrganizations,
            switchOrganization,
            getCurrentOrganization,
            updateDriverMeta,
            updateDriver,
            reloadDriver,
            trackDriver,
            trackDriverLocation,
            organizations,
            storedDriver,
            authToken,
        ]
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
