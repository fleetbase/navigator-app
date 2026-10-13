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
import { isQueuedAck, type ApiError } from '../api/NavigatorAdapter';
import { bumpLiveRefresh, useLiveRefresh } from '../realtime/liveRefresh';
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

export type OfferAnswer = 'accepted' | 'declined' | 'expired' | 'unsupported' | 'failed';

/**
 * Answering a *direct* offer (contract 1.4): `POST orders/{id}/accept` and
 * `POST orders/{id}/decline`. Distinct from the ad-hoc accept above, which
 * claims an unassigned order with `start` + `assign` — that path is unchanged.
 *
 * Never queued (see `NEVER_QUEUE`): an answer that could not be sent before
 * the offer expired is not an answer.
 *
 *   - `expired`     — the server says the window closed.
 *   - `unsupported` — the endpoint does not exist on this server yet (404/405).
 */
export function useRespondToOffer() {
    const { adapter } = useFleetbase();
    const [pending, setPending] = useState<'accept' | 'decline' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const respond = useCallback(
        async (orderId: string, answer: 'accept' | 'decline'): Promise<OfferAnswer> => {
            if (!orderId) return 'failed';
            setPending(answer);
            setError(null);
            try {
                const result = await adapter.post(`orders/${orderId}/${answer}`, {});
                if (isQueuedAck(result)) return 'failed';
                const order = (result as { data?: unknown })?.data ?? result;
                if (answer === 'accept') {
                    if (order && typeof order === 'object' && 'id' in order) orderStore.upsert(order as OrderRecord);
                } else {
                    // Declined: no longer this driver's. Not a reassignment —
                    // they said no — so no notice.
                    orderStore.remove(orderId);
                }
                bumpLiveRefresh();
                return answer === 'accept' ? 'accepted' : 'declined';
            } catch (err) {
                const e = err as ApiError;
                setError(e.message ?? null);
                if (e.status === 404 || e.status === 405) return 'unsupported';
                if (/expired/i.test(e.message ?? '')) {
                    bumpLiveRefresh();
                    return 'expired';
                }
                return 'failed';
            } finally {
                setPending(null);
            }
        },
        [adapter]
    );

    return {
        accept: useCallback((orderId: string) => respond(orderId, 'accept'), [respond]),
        decline: useCallback((orderId: string) => respond(orderId, 'decline'), [respond]),
        isAccepting: pending === 'accept',
        isDeclining: pending === 'decline',
        error,
    };
}

/**
 * Seconds left until `expiresAt`, ticking once a second while there is time
 * left. `undefined` when there is no deadline; `0` once it has passed.
 */
export function useCountdown(expiresAt?: string | null, now: () => number = Date.now): number | undefined {
    const deadline = expiresAt ? Date.parse(expiresAt) : NaN;
    const left = () => (Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now()) / 1000)) : undefined);
    const [seconds, setSeconds] = useState<number | undefined>(left);

    useEffect(() => {
        setSeconds(left());
        if (!Number.isFinite(deadline)) return;
        /*
         * A timeout chain rather than an interval, guarded by `alive`: a tick
         * already queued when the card unmounts must not set state on it.
         */
        let alive = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tick = () => {
            if (!alive) return;
            const next = left();
            setSeconds(next);
            if (next) timer = setTimeout(tick, 1000);
        };
        timer = setTimeout(tick, 1000);
        return () => {
            alive = false;
            if (timer) clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deadline]);

    return seconds;
}

/** "04:59" — minutes and seconds, for an offer countdown. */
export function formatCountdown(seconds?: number): string | undefined {
    if (seconds == null) return undefined;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
