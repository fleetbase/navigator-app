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
import { useLiveRefresh } from '../realtime/liveRefresh';
import { ApiError } from '../api/NavigatorAdapter';
import { orderStore, LISTED_FOR, type OrderRecord } from './orderStore';
import { orderConfigIdOf } from './accessors';
import { cachedOrderConfig, loadOrderConfig } from './orderConfigCache';

export type LoadState = 'idle' | 'loading' | 'refreshing' | 'error' | 'ready';

export interface OrderQueryParams {
    /** Driver public id — the API scopes by `driver_assigned`. */
    driver?: string;
    /** `true` restricts to work in hand. */
    active?: boolean;
    limit?: number;
    [key: string]: unknown;
}

export function useOrderQuery(
    params: OrderQueryParams = {},
    options: {
        enabled?: boolean;
        /**
         * False for a query that is only a *part* of the driver's orders (a
         * date range, say). Its rows are stored like any other, but what it
         * does not return says nothing about the rest, so nothing is removed.
         */
        reconcile?: boolean;
    } = {}
) {
    const { enabled = true, reconcile = true } = options;
    const { adapter } = useFleetbase();
    const [state, setState] = useState<LoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);
    /** A load asked for while another was running: run once more when it ends, with whatever the parameters are by then. */
    const queued = useRef<'loading' | 'refreshing' | null>(null);
    const latest = useRef<(mode?: 'loading' | 'refreshing') => Promise<void>>(async () => undefined);

    // Serialised so the effect does not refire on a fresh object literal.
    const key = JSON.stringify(params);

    const load = useCallback(
        async (mode: 'loading' | 'refreshing' = 'loading') => {
            if (!enabled) return;
            if (inFlight.current) {
                // Not dropped: the parameters may have changed (another date range), or the server may have moved.
                queued.current = queued.current === 'loading' ? 'loading' : mode;
                return;
            }
            inFlight.current = true;
            setState(mode);
            setError(null);

            try {
                const query = { sort: '-created_at', ...JSON.parse(key) } as Record<string, unknown>;
                const result = (await adapter.get('orders', query)) as unknown;
                const rows = (Array.isArray(result) ? result : ((result as { data?: unknown[] })?.data ?? [])) as OrderRecord[];
                /*
                 * A query scoped to one driver is a statement about *all* of
                 * that driver's orders (within its window), so what it no
                 * longer returns has been taken off them. Rows are stamped
                 * with the scope so only rows this query listed are judged.
                 */
                const scope = typeof query.driver_assigned === 'string' ? query.driver_assigned : typeof query.driver === 'string' ? query.driver : undefined;
                const valid = rows.filter((r) => r && typeof r.id === 'string');
                orderStore.upsertMany(scope ? valid.map((r) => ({ ...r, [LISTED_FOR]: scope })) : valid);
                if (scope && reconcile && Array.isArray(rows)) {
                    const limit = Number(query.limit);
                    orderStore.reconcile(scope, valid, { complete: !(limit > 0) || rows.length < limit });
                }
                /*
                 * Which statuses finish an order is the config's call, so the
                 * configs behind these rows are fetched (once each, cached for
                 * the session). Fire-and-forget: the list renders without
                 * them and re-sorts itself when they land.
                 */
                const configIds = new Set(valid.map((r) => orderConfigIdOf(r)).filter((id): id is string => !!id && !cachedOrderConfig(id)));
                for (const id of configIds) void loadOrderConfig(adapter, id).catch(() => undefined);
                setState('ready');
            } catch (err) {
                setError(err as ApiError);
                setState('error');
            } finally {
                inFlight.current = false;
                const again = queued.current;
                queued.current = null;
                if (again) void latest.current(again === 'loading' ? 'refreshing' : again);
            }
        },
        [adapter, enabled, key, reconcile]
    );
    latest.current = load;

    /*
     * `revision` is the socket's way in. The connection never writes to the
     * store; it says the server moved, and every live query then asks what to.
     * Refreshing rather than loading, so an event mid-scroll does not blank the
     * list the driver is reading.
     */
    const revision = useLiveRefresh();
    const isFirstLoad = useRef(true);
    useEffect(() => {
        void load(isFirstLoad.current ? 'loading' : 'refreshing');
        isFirstLoad.current = false;
    }, [load, revision]);

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
