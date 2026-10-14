/**
 * One order by id, from the store first and the API second.
 *
 * The order store is filled by list queries, so an order reached from a
 * manifest stop — which may belong to a job the driver has never opened —
 * is often not in it. This reads what is there for an instant paint and
 * fetches `GET /v1/orders/{id}` to fill or refresh it.
 *
 * It fetches again whenever the server says something moved (the live-refresh
 * signal, bumped by `order.changed` and friends) and whenever the caller's
 * `reloadToken` changes (screen focus) — an order edited by the store while
 * the driver is looking at it must not stay as it was when they opened it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFleetbase } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';
import { useLiveRefresh } from '../realtime/liveRefresh';
import { orderStore, assignedDriverIdOf, LISTED_FOR, type OrderRecord } from './orderStore';
import { useOrder } from './useOrders';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useOrderRecord(orderId?: string | null, reloadToken = 0) {
    const { adapter } = useFleetbase();
    const order = useOrder(orderId ?? undefined);
    const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);
    const alive = useRef(true);
    const revision = useLiveRefresh();

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    const load = useCallback(async () => {
        if (!orderId || inFlight.current) return;
        inFlight.current = true;
        setState('loading');
        setError(null);
        try {
            const raw = await adapter.get(`orders/${orderId}`);
            const row = ((raw as { data?: unknown })?.data ?? raw) as OrderRecord;
            if (row?.id) {
                /*
                 * The order now names another driver: this one was taken off
                 * it. Only judged for an order this driver had listed — one
                 * opened from somewhere else was never theirs to lose.
                 */
                const me = adapter.ownerId;
                const assigned = assignedDriverIdOf(row);
                const held = orderStore.get(row.id);
                if (me && held?.[LISTED_FOR] === me && typeof assigned === 'string' && !UUID.test(assigned) && assigned !== me) {
                    orderStore.remove(row.id, 'reassigned');
                } else {
                    orderStore.upsert(row);
                }
            }
            if (alive.current) setState('ready');
        } catch (err) {
            if (alive.current) {
                setError(err as ApiError);
                setState('error');
            }
        } finally {
            inFlight.current = false;
        }
    }, [adapter, orderId]);

    useEffect(() => {
        void load();
    }, [load, revision, reloadToken]);

    return { order, state, error, isLoading: state === 'loading' && !order, reload: load };
}
