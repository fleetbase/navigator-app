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
 * second is told the order was taken.
 *
 * The server only lists orders this driver can take. When an order is offered
 * one driver at a time, it carries `adhoc_offer.expires_at`, and the driver can
 * decline it with `POST /v1/orders/{id}/decline` so it moves to the next driver.
 * `order.offer_closed` on the driver's channel says an offer ended without them.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFleetbase } from '../api';
import { isQueuedAck } from '../api/NavigatorAdapter';
import { useLiveRefresh } from '../realtime/liveRefresh';
import { orderStore, type OrderRecord } from './orderStore';

export type AcceptOutcome = 'accepted' | 'taken' | 'failed';

/** This driver's open offer for the order, if the server sent one. */
export function offerOf(order: OrderRecord): { status: string; expires_at: string | null } | null {
    const offer = (order as { adhoc_offer?: unknown }).adhoc_offer;
    return offer && typeof offer === 'object' ? (offer as { status: string; expires_at: string | null }) : null;
}

/** Seconds until the driver's offer runs out, or null when it has no time limit. */
export function secondsLeft(order: OrderRecord, now = Date.now()): number | null {
    const expiresAt = offerOf(order)?.expires_at;
    if (!expiresAt) return null;
    return Math.max(0, Math.round((Date.parse(expiresAt) - now) / 1000));
}

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
                // The server's own words for losing the race, or for an offer that moved on.
                return /already started|already been|taken by another|no longer offered/i.test(message) ? 'taken' : 'failed';
            } finally {
                setIsAccepting(false);
            }
        },
        [adapter, driverId]
    );

    return { accept, isAccepting, error };
}

export function useDeclineOffer() {
    const { adapter } = useFleetbase();
    const [isDeclining, setIsDeclining] = useState(false);

    const decline = useCallback(
        async (orderId: string): Promise<boolean> => {
            if (!orderId) return false;
            setIsDeclining(true);
            try {
                const result = await adapter.post(`orders/${orderId}/decline`, {});
                // Like accepting, never queued: a decline replayed later would refuse a job that had already moved on.
                return !isQueuedAck(result);
            } catch {
                return false;
            } finally {
                setIsDeclining(false);
            }
        },
        [adapter]
    );

    return { decline, isDeclining };
}
