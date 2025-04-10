import React, { createContext, useState, useEffect, useCallback, useContext, useMemo } from 'react';
import BackgroundGeolocation from 'react-native-background-geolocation';
import BackgroundFetch from 'react-native-background-fetch';
import { Place, Point } from '@fleetbase/sdk';
import { isEmpty, config } from '../utils';
import { useAuth } from './AuthContext';
import useStorage from '../hooks/use-storage';
import useFleetbase from '../hooks/use-fleetbase';

const LocationContext = createContext({
    location: null,
    isTracking: false,
    startTracking: () => {},
    stopTracking: () => {},
});

export const LocationProvider = ({ children }) => {
    const { isOnline, driver, trackDriver } = useAuth();
    const { adapter } = useFleetbase();
    const [authToken] = useStorage('_driver_token');
    const [location, setLocation] = useStorage(`${driver?.id ?? 'anon'}_location`, {});
    const [isTracking, setIsTracking] = useState(false);

    // Manually track location
    const trackLocation = useCallback(async () => {
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
    }, [trackDriver]);

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
        if (!adapter || !driver || !authToken) return {};

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
    }, [adapter, driver, authToken]);

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

    // Callback to handle location updates.
    const onLocation = useCallback((location) => {
        console.log('[BackgroundGeolocation] onLocation:', location);
        setLocation(location);
    }, []);

    // Callback to handle location errors.
    const onLocationError = useCallback((error) => {
        console.warn('[BackgroundGeolocation] onLocationError:', error);
    }, []);

    // Function to start tracking.
    const startTracking = useCallback(() => {
        BackgroundGeolocation.start(() => {
            setIsTracking(true);
            console.log('[BackgroundGeolocation] Tracking started');
        });
    }, []);

    // Function to stop tracking.
    const stopTracking = useCallback(() => {
        BackgroundGeolocation.stop(() => {
            setIsTracking(false);
            console.log('[BackgroundGeolocation] Tracking stopped');
        });
    }, []);

    useEffect(() => {
        if (!driver) return;

        BackgroundGeolocation.ready(
            {
                backgroundPermissionRationale: {
                    title: `Allow ${config('APP_NAME')} to access your location`,
                    message: `${config('APP_NAME')} collects location data to update your position in real-time, even when the app is closed or running in the background. This allows dispatchers and ops teams to track your progress and provide better support while you drive.`,
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
                if (isOnline) {
                    startTracking();
                }
            }
        );

        // Subscribe to location events.
        BackgroundGeolocation.onLocation(onLocation, onLocationError);

        // Subscribe to motion and activity events.
        BackgroundGeolocation.onMotionChange(onMotionChange);

        // Clean up the listener when unmounting.
        return () => {
            BackgroundGeolocation.removeListeners();
        };
    }, [driver, onLocation, onLocationError, onMotionChange, isOnline, getHttpConfig]);

    // Configure BackgroundFetch for periodic tasks.
    useEffect(() => {
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
    }, [trackLocation]);

    // Toggle tracking based on the driver's online status.
    useEffect(() => {
        if (!driver) return;
        if (isOnline) {
            startTracking();
        } else {
            stopTracking();
        }

        if (isEmpty(location) && driver) {
            trackLocation();
        }
    }, [driver, isOnline, startTracking, stopTracking]);

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
