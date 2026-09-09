/**
 * One order by id, from the store first and the API second.
 *
 * The order store is filled by list queries, so an order reached from a
 * manifest stop — which may belong to a job the driver has never opened —
 * is often not in it. This reads what is there for an instant paint and
 * fetches `GET /v1/orders/{id}` to fill or refresh it.
 */
import { useEffect, useRef, useState } from 'react';
import { useFleetbase } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';
import { orderStore, type OrderRecord } from './orderStore';
import { useOrder } from './useOrders';

/** Statuses after which an order asks nothing more of the driver. */
const FINISHED = new Set(['completed', 'order_completed', 'canceled', 'order_canceled', 'cancelled', 'failed']);

export function isOrderFinished(order?: Pick<OrderRecord, 'status'> | null): boolean {
    return FINISHED.has(String(order?.status ?? '').toLowerCase());
}

export function useOrderRecord(orderId?: string | null) {
    const { adapter } = useFleetbase();
    const order = useOrder(orderId ?? undefined);
    const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);

    useEffect(() => {
        if (!orderId || inFlight.current) return;
        let alive = true;
        inFlight.current = true;
        setState('loading');
        setError(null);
        adapter
            .get(`orders/${orderId}`)
            .then((raw) => {
                const row = ((raw as { data?: unknown })?.data ?? raw) as OrderRecord;
                if (row?.id) orderStore.upsert(row);
                if (alive) setState('ready');
            })
            .catch((err: ApiError) => {
                if (alive) {
                    setError(err);
                    setState('error');
                }
            })
            .finally(() => {
                inFlight.current = false;
            });
        return () => {
            alive = false;
        };
    }, [adapter, orderId]);

    return { order, state, error, isLoading: state === 'loading' && !order };
}
