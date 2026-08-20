/**
 * Fetches orders into the normalised store.
 *
 * Reads go through the adapter so a transport failure surfaces as an error
 * state (reads are never queued — replaying a stale GET on reconnect is
 * wrong). Results land in the store, and screens select from there, so the
 * list keeps its identity-stable array.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFleetbase } from '../api';
import { ApiError } from '../api/NavigatorAdapter';
import { orderStore, type OrderRecord } from './orderStore';

export type LoadState = 'idle' | 'loading' | 'refreshing' | 'error' | 'ready';

export interface OrderQueryParams {
    /** Driver public id — the API scopes by `driver_assigned`. */
    driver?: string;
    /** `true` restricts to work in hand. */
    active?: boolean;
    limit?: number;
    [key: string]: unknown;
}

export function useOrderQuery(params: OrderQueryParams = {}, options: { enabled?: boolean } = {}) {
    const { enabled = true } = options;
    const { adapter } = useFleetbase();
    const [state, setState] = useState<LoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);

    // Serialised so the effect does not refire on a fresh object literal.
    const key = JSON.stringify(params);

    const load = useCallback(
        async (mode: 'loading' | 'refreshing' = 'loading') => {
            if (!enabled || inFlight.current) return;
            inFlight.current = true;
            setState(mode);
            setError(null);

            try {
                const query = { sort: '-created_at', ...JSON.parse(key) } as Record<string, unknown>;
                const result = (await adapter.get('orders', query)) as unknown;
                const rows = Array.isArray(result) ? result : ((result as { data?: unknown[] })?.data ?? []);
                orderStore.upsertMany(rows as OrderRecord[]);
                setState('ready');
            } catch (err) {
                setError(err as ApiError);
                setState('error');
            } finally {
                inFlight.current = false;
            }
        },
        [adapter, enabled, key]
    );

    useEffect(() => {
        void load('loading');
    }, [load]);

    return {
        state,
        error,
        isLoading: state === 'loading',
        isRefreshing: state === 'refreshing',
        /** Pull-to-refresh keeps existing rows on screen. */
        refresh: useCallback(() => load('refreshing'), [load]),
        retry: useCallback(() => load('loading'), [load]),
    };
}

export default useOrderQuery;
