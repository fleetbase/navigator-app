import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useFleetbase from './use-fleetbase';
import useStorage from './use-storage';

export function useOrderResource(order, options = {}) {
    const { fetchOnMount = true } = options;
    const { adapter } = useFleetbase();

    // Get current order status
    const status = order.getAttribute('status');
    // Get order ID
    const id = order.id;

    // Initialize storage with the order's attributes as defaults
    const [trackerData, setTrackerData] = useStorage(`${id}_tracker_data`, order.getAttribute('tracker_data') ?? {});
    const [etaData, setEtaData] = useStorage(`${id}_eta_data`, order.getAttribute('eta') ?? {});
    const [error, setError] = useState(null);
    const [isFetchingTracker, setIsFetchingTracker] = useState(false);
    const [isFetchingEta, setIsFetchingEta] = useState(false);

    // Generic fetch function for reusability
    const fetchData = useCallback(
        async (endpoint: string, setData: (data: any) => void, setIsFetching: (loading: boolean) => void) => {
            if (!adapter || !id) return;
            setIsFetching(true);
            setError(null);
            try {
                const data = await adapter.get(endpoint);
                setData(data);
                return data;
            } catch (err) {
                console.warn(`Error fetching data from ${endpoint}:`, err);
                setError(err as Error);
            } finally {
                setIsFetching(false);
            }
        },
        [adapter, id]
    );

    const fetchTrackerData = useCallback(() => {
        return fetchData(`orders/${order.id}/tracker`, setTrackerData, setIsFetchingTracker);
    }, [id, fetchData, setTrackerData, setIsFetchingTracker]);

    const fetchEtaData = useCallback(() => {
        return fetchData(`orders/${order.id}/eta`, setEtaData, setIsFetchingEta);
    }, [id, fetchData, setEtaData, setIsFetchingEta]);

    // Use a ref to ensure we fetch data only once per order
    const hasFetchedRef = useRef(false);
    const prevOrderIdRef = useRef(id);
    const prevOrderStatusRef = useRef(status);

    useEffect(() => {
        // If the order id changes OR status, reset the flag so new data can be fetched
        if (prevOrderIdRef.current !== id || prevOrderStatusRef.current !== status) {
            hasFetchedRef.current = false;
            prevOrderIdRef.current = id;
            prevOrderStatusRef.current = status;
        }
        if (fetchOnMount && id && !hasFetchedRef.current) {
            hasFetchedRef.current = true;
            void fetchTrackerData();
            void fetchEtaData();
        }
    }, [fetchOnMount, id, status, fetchTrackerData, fetchEtaData]);

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
