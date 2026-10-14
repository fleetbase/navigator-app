import React, { createContext, useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { AppState, Platform } from 'react-native';
import BackgroundGeolocation from 'react-native-background-geolocation';
import BackgroundFetch from 'react-native-background-fetch';
import { check, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { Place, Point } from '@fleetbase/sdk';
import { isEmpty } from '../utils';
import { useAuth } from './AuthContext';
import useStorage from '../hooks/use-storage';
import useFleetbase from '../hooks/use-fleetbase';

const LocationContext = createContext({
    location: null,
    isTracking: false,
    startTracking: () => {},
    stopTracking: () => {},
});

const getLocationPermission = () => (Platform.OS === 'ios' ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);

export const isLocationTrackingAllowed = ({ driver, isOnline, permissionStatus }) => Boolean(driver && isOnline && permissionStatus === RESULTS.GRANTED);

export const LocationProvider = ({ children }) => {
    const { isOnline, driver, trackDriver } = useAuth();
    const { adapter } = useFleetbase();
    const [authToken] = useStorage('_driver_token');
    const [location, setLocation] = useStorage(`${driver?.id ?? 'anon'}_location`, {});
    const [isTracking, setIsTracking] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState(Platform.OS === 'web' ? RESULTS.GRANTED : RESULTS.DENIED);
    const canTrackLocation = isLocationTrackingAllowed({ driver, isOnline, permissionStatus });
    const hasStoredLocation = !isEmpty(location);

    // Keep native tracking synchronized with permission changes made in Settings.
    useEffect(() => {
        if (Platform.OS === 'web') return;

        let isMounted = true;
        const refreshPermissionStatus = async () => {
            const status = await check(getLocationPermission());
            if (isMounted) {
                setPermissionStatus(status);
            }
        };

        refreshPermissionStatus();
        const subscription = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                refreshPermissionStatus();
            }
        });

        return () => {
            isMounted = false;
            subscription.remove();
        };
    }, []);

    // Manually track location
    const trackLocation = useCallback(async () => {
        if (!canTrackLocation) return;

        try {
            const location = await BackgroundGeolocation.getCurrentPosition({
                samples: 3,
                desiredAccuracy: 1,
                extras: {
                    event: 'getCurrentPosition',
                },
            });
            setLocation(location);
            trackDriver(location.coords);
        } catch (error) {
            console.warn('Error attempting to track and update location:', error);
        }
    }, [canTrackLocation, trackDriver, setLocation]);

    // Get the drivers location as a Place
    const getDriverLocationAsPlace = useCallback(
        (attributes = {}) => {
            const { coords } = location;

            return new Place(
                {
                    id: 'driver',
                    name: 'Driver Location',
                    street1: 'Driver Location',
                    location: new Point(coords.latitude, coords.longitude),
                    ...attributes,
                },
                adapter
            );
        },
        [location, adapter]
    );

    // Get the HTTP configuration for background geolocation tracking
    const getHttpConfig = useCallback(() => {
        if (!adapter || !driver?.id || !authToken) return {};

        return {
            url: `${adapter.host}/${adapter.namespace}/drivers/${driver.id}/track`,
            headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
                'User-Agent': '@fleetbase/navigator-app',
            },
            httpRootProperty: '.',
            locationTemplate:
                '{"latitude":<%= latitude %>,"longitude":<%= longitude %>,"heading":<%= heading %>,"speed":<%= speed %>,"altitude":<%= altitude %>,"timestamp":"<%= timestamp %>","activity":"<%= activity.type %>","is_moving":<%= is_moving %>,"battery":{"level":<%= battery.level %>,"is_charging":<%= battery.is_charging %>}}',
        };
    }, [adapter, driver?.id, authToken]);

    // Callback to handle location updates.
    const onLocation = useCallback(
        (location) => {
            console.log('[BackgroundGeolocation] onLocation:', location);
            setLocation(location);
        },
        [setLocation]
    );

    // Callback to handle activity updates.
    const onMotionChange = useCallback(
        (event) => {
            console.log('[BackgroundGeolocation] onMotionChange:', event);
            if (event.location) {
                onLocation(event.location);
            }
        },
        [onLocation]
    );

    // Callback to handle location errors.
    const onLocationError = useCallback((error) => {
        console.warn('[BackgroundGeolocation] onLocationError:', error);
    }, []);

    // Function to start tracking.
    const startTracking = useCallback(() => {
        if (!canTrackLocation) return;

        BackgroundGeolocation.start(() => {
            setIsTracking(true);
            console.log('[BackgroundGeolocation] Tracking started');
        });
    }, [canTrackLocation]);

    // Function to stop tracking.
    const stopTracking = useCallback(() => {
        BackgroundGeolocation.stop(() => {
            setIsTracking(false);
            console.log('[BackgroundGeolocation] Tracking stopped');
        });
    }, []);

    useEffect(() => {
        if (!canTrackLocation) {
            stopTracking();
            return;
        }

        let isActive = true;
        const subscriptions = [];

        BackgroundGeolocation.ready(
            {
                backgroundPermissionRationale: {
                    title: 'Allow Fleetbase Navigator to access your location',
                    message:
                        'Fleetbase Navigator collects precise location data to enable real-time driver tracking and order progress updates for your organization’s dispatchers and operations team, even when the app is closed or not in use. Location is collected while you are online and is sent securely to Fleetbase.',
                    positiveAction: 'Allow',
                    negativeAction: 'Deny',
                },
                desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
                distanceFilter: 10,
                stopOnTerminate: false,
                startOnBoot: true,
                stopTimeout: 1,
                debug: false,
                ...getHttpConfig(),
            },
            (state) => {
                console.log('[BackgroundGeolocation] is ready:', state);
                if (isActive) {
                    startTracking();
                }
            }
        );

        // Subscribe to location events.
        subscriptions.push(BackgroundGeolocation.onLocation(onLocation, onLocationError));

        // Subscribe to motion and activity events.
        subscriptions.push(BackgroundGeolocation.onMotionChange(onMotionChange));

        // Clean up the listener when unmounting.
        return () => {
            isActive = false;
            subscriptions.forEach((subscription) => subscription?.remove?.());
        };
    }, [canTrackLocation, onLocation, onLocationError, onMotionChange, getHttpConfig, startTracking, stopTracking]);

    // Configure BackgroundFetch for periodic tasks.
    useEffect(() => {
        if (!canTrackLocation) {
            BackgroundFetch.stop();
            return;
        }

        BackgroundFetch.configure(
            {
                minimumFetchInterval: 5,
                stopOnTerminate: false,
                startOnBoot: true,
            },
            async (taskId) => {
                await trackLocation();
                BackgroundFetch.finish(taskId);
            },
            (error) => {
                console.warn('[BackgroundFetch] failed to configure:', error);
            }
        );

        if (!hasStoredLocation && driver) {
            trackLocation();
        }

        return () => {
            BackgroundFetch.stop();
        };
    }, [canTrackLocation, driver?.id, hasStoredLocation, trackLocation]);

    // Memoize the context value to prevent unnecessary re-renders.
    const value = useMemo(
        () => ({ location, isTracking, startTracking, stopTracking, getDriverLocationAsPlace, trackLocation }),
        [location, isTracking, startTracking, stopTracking, getDriverLocationAsPlace, trackLocation]
    );

    return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

// Custom hook to use the LocationContext.
export const useLocation = () => {
    const context = useContext(LocationContext);
    if (context === undefined) {
        throw new Error('useLocation must be used within a LocationProvider');
    }
    return context;
};
