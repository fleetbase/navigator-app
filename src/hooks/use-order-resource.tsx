import { useCallback, useEffect, useRef, useState } from 'react';
import useFleetbase from './use-fleetbase';
import useStorage from './use-storage';

// Module-level cache and in-flight trackers
const cache: Record<string, { data: any; ts: number }> = {};
const inFlight: Record<string, Promise<any>> = {};

/**
 * Fetch with TTL-based caching and in-flight deduplication.
 * @param key Unique cache key (e.g., endpoint URL)
 * @param fetcher Function returning a Promise for the network request
 * @param ttl Time-to-live in milliseconds (0 = always fetch)
 */
async function getWithCache(key: string, fetcher: () => Promise<any>, ttl = 5 * 60 * 1000) {
    const now = Date.now();

    // Return cached if still fresh
    if (cache[key] && now - cache[key].ts < ttl) {
        return cache[key].data;
    }

    // Return the in-flight promise if already fetching
    if (inFlight[key]) {
        return inFlight[key];
    }

    // Otherwise kick off a new fetch
    inFlight[key] = fetcher()
        .then((data) => {
            cache[key] = { data, ts: Date.now() };
            return data;
        })
        .finally(() => {
            delete inFlight[key];
        });

    return inFlight[key];
}

export function useOrderResource(
    order: any,
    options: {
        fetchOnMount?: boolean;
        loadTracker?: boolean;
        loadEta?: boolean;
    } = {}
) {
    const { fetchOnMount = true, loadTracker = true, loadEta = true } = options;
    const { adapter } = useFleetbase();
    const id = order.id;
    const status = order.getAttribute('status');

    // Hydrate from storage for immediate UI values
    const [trackerData, setTrackerData] = useStorage(`${id}_tracker_data`, order.getAttribute('tracker_data') ?? {});
    const [etaData, setEtaData] = useStorage(`${id}_eta_data`, order.getAttribute('eta') ?? {});

    const [error, setError] = useState<Error | null>(null);
    const [isFetchingTracker, setIsFetchingTracker] = useState(false);
    const [isFetchingEta, setIsFetchingEta] = useState(false);

    // Fetch tracker with optional force bypassing TTL
    const fetchTrackerData = useCallback(
        async (force = false) => {
            if (!adapter || !id) return;
            setIsFetchingTracker(true);
            setError(null);

            try {
                const data = await getWithCache(`orders/${id}/tracker`, () => adapter.get(`orders/${id}/tracker`), force ? 0 : 5 * 60 * 1000);
                setTrackerData(data);
                return data;
            } catch (err) {
                setError(err as Error);
            } finally {
                setIsFetchingTracker(false);
            }
        },
        [adapter, id, setTrackerData]
    );

    // Fetch ETA with optional force bypassing TTL
    const fetchEtaData = useCallback(
        async (force = false) => {
            if (!adapter || !id) return;
            setIsFetchingEta(true);
            setError(null);

            try {
                const data = await getWithCache(`orders/${id}/eta`, () => adapter.get(`orders/${id}/eta`), force ? 0 : 5 * 60 * 1000);
                setEtaData(data);
                return data;
            } catch (err) {
                setError(err as Error);
            } finally {
                setIsFetchingEta(false);
            }
        },
        [adapter, id, setEtaData]
    );

    // Refs to track changes in id and status
    const prevOrderIdRef = useRef(id);
    const prevStatusRef = useRef(status);

    // Initial fetch on mount or when order id changes
    useEffect(() => {
        if (!fetchOnMount || !id) return;

        if (loadTracker) {
            void fetchTrackerData();
        }
        if (loadEta) {
            void fetchEtaData();
        }
    }, [fetchOnMount, id, loadTracker, loadEta, fetchTrackerData, fetchEtaData]);

    // On status change, clear cache and force a reload
    useEffect(() => {
        if (prevOrderIdRef.current !== id) {
            // Order changed: reset refs
            prevOrderIdRef.current = id;
            prevStatusRef.current = status;
        } else if (prevStatusRef.current !== status) {
            // Status changed: clear cached entries & refetch
            prevStatusRef.current = status;

            if (loadTracker) {
                delete cache[`orders/${id}/tracker`];
                void fetchTrackerData(true);
            }
            if (loadEta) {
                delete cache[`orders/${id}/eta`];
                void fetchEtaData(true);
            }
        }
    }, [id, status, loadTracker, loadEta, fetchTrackerData, fetchEtaData]);

    return {
        trackerData,
        etaData,
        isFetchingTracker,
        isFetchingEta,
        error,
        // Manual reload always bypasses TTL
        fetchTrackerData: () => fetchTrackerData(true),
        fetchEtaData: () => fetchEtaData(true),
    };
}

export default useOrderResource;
