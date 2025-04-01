import { useMemo, useState, useEffect, useCallback } from 'react';
import Fleetbase from '@fleetbase/sdk';
import { useConfig } from '../contexts/ConfigContext';
import useStorage from './use-storage';

const useFleetbase = () => {
    const { resolveConnectionConfig } = useConfig();
    const FLEETBASE_KEY = resolveConnectionConfig('FLEETBASE_KEY');
    const FLEETBASE_HOST = resolveConnectionConfig('FLEETBASE_HOST');

    const [error, setError] = useState<Error | null>(null);
    const [authToken] = useStorage('_driver_token');
    const [fleetbase, setFleetbase] = useState<Fleetbase | null>(new Fleetbase(authToken ?? FLEETBASE_KEY, { host: FLEETBASE_HOST }));

    const hasFleetbaseConfig = useCallback(() => {
        const FLEETBASE_KEY = resolveConnectionConfig('FLEETBASE_KEY');
        const FLEETBASE_HOST = resolveConnectionConfig('FLEETBASE_HOST');

        return typeof FLEETBASE_KEY === 'string' && typeof FLEETBASE_HOST === 'string';
    }, [resolveConnectionConfig]);

    useEffect(() => {
        const FLEETBASE_HOST = resolveConnectionConfig('FLEETBASE_HOST');
        const FLEETBASE_KEY = resolveConnectionConfig('FLEETBASE_KEY');

        try {
            // If authToken is present, initialize a new Fleetbase instance with it,
            // otherwise fall back to the default configuration.
            const fleetbase = authToken ? new Fleetbase(authToken, { host: FLEETBASE_HOST }) : new Fleetbase(FLEETBASE_KEY, { host: FLEETBASE_HOST });
            setFleetbase(fleetbase);
        } catch (initializationError) {
            setError(initializationError as Error);
        }
    }, [authToken, resolveConnectionConfig]);

    // Memoize the adapter so that its reference only changes when the fleetbase instance updates.
    const adapter = useMemo(() => {
        if (!fleetbase) return null;
        return fleetbase.getAdapter();
    }, [fleetbase, authToken]);

    // Memoize the returned object to prevent unnecessary re-renders.
    const api = useMemo(
        () => ({
            fleetbase,
            adapter,
            error,
            hasFleetbaseConfig,
        }),
        [fleetbase, adapter, error, authToken, hasFleetbaseConfig]
    );

    return api;
};

export default useFleetbase;
