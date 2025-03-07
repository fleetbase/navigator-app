import { useMemo, useState, useEffect } from 'react';
import Fleetbase from '@fleetbase/sdk';
import Config from 'react-native-config';
import useStorage from './use-storage';

const { FLEETBASE_KEY, FLEETBASE_HOST } = Config;

// Global default instance used if no token-based instance is created
export let instance = new Fleetbase(FLEETBASE_KEY, { host: FLEETBASE_HOST });
export let adapter = instance.getAdapter();

export const hasFleetbaseConfig = () => {
    return 'FLEETBASE_KEY' in Config;
};

const useFleetbase = () => {
    const [fleetbase, setFleetbase] = useState<Fleetbase | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [authToken] = useStorage('_driver_token');

    useEffect(() => {
        try {
            // If authToken is present, initialize a new Fleetbase instance with it,
            // otherwise fall back to the default configuration.
            const newFleetbase = authToken ? new Fleetbase(authToken, { host: FLEETBASE_HOST }) : new Fleetbase(FLEETBASE_KEY, { host: FLEETBASE_HOST });
            setFleetbase(newFleetbase);
        } catch (initializationError) {
            setError(initializationError as Error);
        }
    }, [authToken]);

    // Memoize the adapter so that its reference only changes when the fleetbase instance updates.
    const fleetbaseAdapter = useMemo(() => {
        return fleetbase ? fleetbase.getAdapter() : adapter;
    }, [fleetbase]);

    // Memoize the returned object to prevent unnecessary re-renders.
    const api = useMemo(
        () => ({
            fleetbase,
            adapter: fleetbaseAdapter,
            error,
            hasFleetbaseConfig,
        }),
        [fleetbase, fleetbaseAdapter, error]
    );

    return api;
};

export default useFleetbase;
