import { useState, useEffect, useCallback, useMemo } from 'react';
import { EventRegister } from 'react-native-event-listeners';
import { getCurrentLocation as fetchCurrentLocation, getLiveLocation, restoreFleetbasePlace, getLastKnownPosition } from '../utils/location';
import { isResource, isArray } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import useStorage from './use-storage';
import useFleetbase from './use-fleetbase';

const useCurrentLocation = () => {
    const { isAuthenticated, driver } = useAuth();
    const { adapter } = useFleetbase();
    const [currentLocation, setCurrentLocation] = useStorage('_current_location');
    const [liveLocation, setLiveLocation] = useStorage('_live_location');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Memoized function to update the current location
    const updateCurrentLocation = useCallback(
        async (location) => {
            const place = typeof location.serialize === 'function' ? location : restoreFleetbasePlace(location, adapter);
            const serializedPlace = place.serialize();
            // Only update if the new location is different
            setCurrentLocation((prevLocation) => {
                if (JSON.stringify(prevLocation) !== JSON.stringify(serializedPlace)) {
                    EventRegister.emit('current_location.updated', place);
                    return serializedPlace;
                }

                return prevLocation;
            });
        },
        [setCurrentLocation]
    );

    // Memoized function to compute current location coordinates
    const getCurrentLocationCoordinates = useCallback(() => {
        if (isResource(currentLocation)) {
            return currentLocation.getAttribute('location');
        }
        if (isArray(currentLocation?.location)) {
            return currentLocation.location;
        }
        if (currentLocation?.latitude && currentLocation?.longitude) {
            return [currentLocation.latitude, currentLocation.longitude];
        }
        return getLastKnownPosition();
    }, [currentLocation]);

    // Memoized function to initialize the current location
    const initializeCurrentLocation = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const location = await fetchCurrentLocation(adapter);
            await updateCurrentLocation(location);
        } catch (err) {
            console.warn('Error fetching current location:', err);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, driver, updateCurrentLocation]);

    // Memoized function to initialize live location updates
    const initializeLiveLocation = useCallback(async () => {
        try {
            const location = await getLiveLocation(adapter);
            if (location) {
                setLiveLocation(location.serialize());
            }
        } catch (err) {
            console.warn('Error fetching live location:', err);
            setError(err);
        }
    }, [setLiveLocation]);

    // Memoized function to update the location
    const updateDefaultLocation = useCallback(
        (instance) => {
            updateCurrentLocation(instance);
        },
        [updateCurrentLocation]
    );

    // Return a promise-based updater
    const updateDefaultLocationPromise = useCallback(
        (instance) => {
            return new Promise(async (resolve) => {
                await updateDefaultLocation(instance);
                resolve(instance);
            });
        },
        [updateDefaultLocation]
    );

    // On mount (or when initializeLiveLocation changes), start live location updates.
    useEffect(() => {
        // Immediately call the live location initializer on mount
        initializeLiveLocation();

        // Then set an interval to update every 5 minutes (300,000ms)
        const intervalId = setInterval(
            () => {
                initializeLiveLocation();
            },
            1000 * 60 * 5
        );

        return () => {
            clearInterval(intervalId);
        };
    }, []);

    // On mount and when currentLocation changes, initialize the current location if not set.
    useEffect(() => {
        if (!currentLocation) {
            initializeCurrentLocation();
        }
    }, [currentLocation?.id, initializeCurrentLocation]);

    // Memoize the hook's return value to avoid unnecessary re-renders in consumers
    const value = useMemo(
        () => ({
            currentLocation: currentLocation ? restoreFleetbasePlace(currentLocation, adapter) : null,
            liveLocation: liveLocation ? restoreFleetbasePlace(liveLocation, adapter) : null,
            updateCurrentLocation,
            setCurrentLocation,
            updateDefaultLocationPromise,
            updateDefaultLocation,
            getCurrentLocationCoordinates,
            initializeCurrentLocation,
            initializeLiveLocation,
            isLoadingCurrentLocation: loading,
            currentLocationError: error,
        }),
        [
            currentLocation,
            liveLocation,
            updateCurrentLocation,
            setCurrentLocation,
            updateDefaultLocationPromise,
            updateDefaultLocation,
            getCurrentLocationCoordinates,
            initializeCurrentLocation,
            initializeLiveLocation,
            loading,
            error,
        ]
    );

    return value;
};

export default useCurrentLocation;
