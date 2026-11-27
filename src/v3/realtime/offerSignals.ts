/**
 * "An offer was just sent to this driver" and "this driver's offer just closed".
 *
 * The offers themselves are a query (`useOffers`); a ping only says *look
 * again*. But two facts are not in the list the query returns, and the
 * incoming-offer overlay needs both:
 *
 *   - **which order the server just rang the driver about.** A job that has
 *     been listed for an hour and a job the server offered a second ago look the
 *     same in the list; only the second should rise over the screen.
 *   - **why an offer went away.** Once it closes it is simply absent from the
 *     list. `order.offer_closed` says whether it ran out (`expired`) or was
 *     taken back (`withdrawn`: another driver took the job, or it was cancelled).
 *
 * Fed by `applyRealtimeEvent`, so the driver's socket channel and a push in the
 * foreground both land here. Nothing is shown from these alone: an `order.ping`
 * is also what the console's "ping driver" sends about an order that is already
 * assigned, and that is not an offer. The overlay shows an order only when the
 * offers query lists it.
 */
import { useSyncExternalStore } from 'react';

export type OfferClosedStatus = 'expired' | 'withdrawn';

export interface OfferSignals {
    /** Order id → when the server last rang this driver about it (phone clock, ms). */
    pings: Record<string, number>;
    /** Order id → how and when this driver's offer for it closed. */
    closed: Record<string, { status: OfferClosedStatus; at: number }>;
}

let signals: OfferSignals = { pings: {}, closed: {} };
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
}

/** The server offered this order to the driver just now. */
export function noteOfferPing(orderId?: string): void {
    if (!orderId) return;
    signals = { ...signals, pings: { ...signals.pings, [orderId]: Date.now() } };
    emit();
}

/** The driver's offer for this order closed without them taking it. */
export function noteOfferClosed(orderId?: string, status?: unknown): void {
    if (!orderId) return;
    const how: OfferClosedStatus = status === 'expired' ? 'expired' : 'withdrawn';
    signals = { ...signals, closed: { ...signals.closed, [orderId]: { status: how, at: Date.now() } } };
    emit();
}

export function offerSignals(): OfferSignals {
    return signals;
}

/** Resets between tests; not used by the app. */
export function resetOfferSignals(): void {
    signals = { pings: {}, closed: {} };
    listeners.clear();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function useOfferSignals(): OfferSignals {
    return useSyncExternalStore(subscribe, offerSignals, offerSignals);
}
