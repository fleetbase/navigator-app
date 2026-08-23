/**
 * Ad-hoc offers — R2 D1.
 *
 * An order flagged `adhoc` with no driver assigned is offered to whoever is
 * nearby: `DispatchAdhocOrders` runs every minute, finds drivers within the
 * order's ping distance (`adhoc_distance`, six kilometres by default), and
 * notifies each with `OrderPing`. That notification broadcasts as `order.ping`
 * on the driver's own channel, which is how the app learns an offer exists
 * without polling.
 *
 * The list itself is a query, not a socket payload — same rule as everywhere
 * else. The ping says *look again*; this is the looking.
 *
 * Accepting is `POST /v1/orders/{id}/start` with `assign: driver_xxx`, which
 * the controller honours only for an adhoc order and only for an id shaped like
 * a driver's. Losing the race is therefore a server-side refusal rather than
 * something the app has to arbitrate: two drivers can both tap accept, and the
 * second is told the order has already started.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFleetbase } from '../api';
import { isQueuedAck } from '../api/NavigatorAdapter';
import { useLiveRefresh } from '../realtime/liveRefresh';
import { orderStore, type OrderRecord } from './orderStore';

export type AcceptOutcome = 'accepted' | 'taken' | 'failed';

export function useOffers(driverId?: string) {
    const { adapter } = useFleetbase();
    const [offers, setOffers] = useState<OrderRecord[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<unknown>(null);
    const revision = useLiveRefresh();

    const load = useCallback(async () => {
        if (!driverId) {
            setOffers([]);
            setIsLoading(false);
            return;
        }
        setError(null);
        try {
            /*
             * The same filter v2 used. `nearby` is what scopes this to offers
             * the driver could actually take — without it the query returns
             * every unassigned adhoc order in the company.
             */
            const raw = await adapter.get('orders', { nearby: driverId, adhoc: 1, unassigned: 1, dispatched: 1, limit: -1 });
            const rows = (raw as { data?: unknown })?.data ?? raw;
            setOffers(Array.isArray(rows) ? (rows as OrderRecord[]) : []);
        } catch (err) {
            setError(err);
        } finally {
            setIsLoading(false);
        }
    }, [adapter, driverId]);

    useEffect(() => {
        void load();
    }, [load, revision]);

    return { offers, isLoading, error, reload: load };
}

export function useAcceptOffer(driverId?: string) {
    const { adapter } = useFleetbase();
    const [isAccepting, setIsAccepting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const accept = useCallback(
        async (orderId: string): Promise<AcceptOutcome> => {
            if (!driverId || !orderId) return 'failed';
            setIsAccepting(true);
            setError(null);
            try {
                const result = await adapter.post(`orders/${orderId}/start`, { assign: driverId });
                /*
                 * Never queue an acceptance. An offer is a race against other
                 * drivers and against the order being cancelled; replaying one
                 * from a queue an hour later would claim a job that has long
                 * since gone to somebody else. `NEVER_QUEUE` covers the path,
                 * and this is the belt to that pair of braces.
                 */
                if (isQueuedAck(result)) return 'failed';
                const order = (result as { data?: unknown })?.data ?? result;
                if (order && typeof order === 'object' && 'id' in order) {
                    orderStore.upsert(order as OrderRecord);
                }
                return 'accepted';
            } catch (err) {
                const message = (err as Error).message ?? '';
                setError(message);
                // The server's own words for losing the race.
                return /already started|already been/i.test(message) ? 'taken' : 'failed';
            } finally {
                setIsAccepting(false);
            }
        },
        [adapter, driverId]
    );

    return { accept, isAccepting, error };
}
