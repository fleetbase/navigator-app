import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useFleetbase from './use-fleetbase';
import useStorage from './use-storage';

export function useOrderResource(order, options = {}) {
    const { fetchOnMount = true } = options;
    const { adapter } = useFleetbase();

    // Initialize storage with the order's attributes as defaults
    const [trackerData, setTrackerData] = useStorage(`${order?.id}_tracker_data`, order.getAttribute('tracker_data'));
    const [etaData, setEtaData] = useStorage(`${order?.id}_eta_data`, order.getAttribute('eta'));
    const [error, setError] = useState(null);
    const [isFetchingTracker, setIsFetchingTracker] = useState(false);
    const [isFetchingEta, setIsFetchingEta] = useState(false);

    // Generic fetch function for reusability
    const fetchData = useCallback(
        async (endpoint: string, setData: (data: any) => void, setIsFetching: (loading: boolean) => void) => {
            if (!adapter || !order?.id) return;
            setIsFetching(true);
            setError(null);
            try {
                const data = await adapter.get(endpoint);
                setData(data);
                return data;
            } catch (err) {
                console.error(`Error fetching data from ${endpoint}:`, err);
                setError(err as Error);
            } finally {
                setIsFetching(false);
            }
        },
        [adapter, order?.id]
    );

    const fetchTrackerData = useCallback(() => {
        return fetchData(`orders/${order.id}/tracker`, setTrackerData, setIsFetchingTracker);
    }, [order?.id, fetchData, setTrackerData, setIsFetchingTracker]);

    const fetchEtaData = useCallback(() => {
        return fetchData(`orders/${order.id}/eta`, setEtaData, setIsFetchingEta);
    }, [order?.id, fetchData, setEtaData, setIsFetchingEta]);

    // Use a ref to ensure we fetch data only once per order
    const hasFetchedRef = useRef(false);
    const prevOrderIdRef = useRef(order?.id);

    useEffect(() => {
        // If the order id changes, reset the flag so new data can be fetched
        if (prevOrderIdRef.current !== order?.id) {
            hasFetchedRef.current = false;
            prevOrderIdRef.current = order?.id;
        }
        if (fetchOnMount && order?.id && !hasFetchedRef.current) {
            hasFetchedRef.current = true;
            void fetchTrackerData();
            void fetchEtaData();
        }
    }, [fetchOnMount, order?.id, fetchTrackerData, fetchEtaData]);

    // Memoize the returned object so that its reference only changes when its values change
    const orderResource = useMemo(
        () => ({
            trackerData,
            etaData,
            isFetchingTracker,
            isFetchingEta,
            error,
            fetchTrackerData,
            fetchEtaData,
        }),
        [trackerData, etaData, isFetchingTracker, isFetchingEta, error, fetchTrackerData, fetchEtaData]
    );

    return orderResource;
}

export default useOrderResource;
