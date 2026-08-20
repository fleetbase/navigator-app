/**
 * The order's activity history — R2 frame D5.
 *
 * Three facts from a live instance shape this:
 *
 *   - `tracking_statuses` is **already embedded on the order**, so the timeline
 *     paints immediately from the store and the network is only a refresh.
 *   - `city` / `province` / `country` are null, and `location` is a GeoJSON
 *     point at **[0, 0]** — null island, not a place the driver has been.
 *     Rendering it would put every event in the Gulf of Guinea, so
 *     `placeOf` returns undefined for it and the row omits the location.
 *   - **There is no actor.** D5 asks for one; the API does not record who
 *     advanced the status on a tracking status row. The row omits it rather
 *     than guessing "Driver".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFleetbase } from '../api';
import { orderStore, type OrderRecord } from './orderStore';
import { useOrder } from './useOrders';

export interface TrackingStatusEvent {
    id: string;
    status?: string;
    details?: string;
    code?: string;
    complete?: boolean;
    city?: string | null;
    province?: string | null;
    postal_code?: string | null;
    country?: string | null;
    location?: { type?: string; coordinates?: number[] } | null;
    created_at?: string;
    updated_at?: string;
}

/** A GeoJSON point at exactly [0, 0] is a placeholder, not a position. */
export function isRealPoint(location?: TrackingStatusEvent['location']): boolean {
    const c = location?.coordinates;
    if (!Array.isArray(c) || c.length < 2) return false;
    const [lng, lat] = c;
    if (typeof lng !== 'number' || typeof lat !== 'number') return false;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
    return !(lng === 0 && lat === 0);
}

/** Human place for an event, or undefined when nothing real is known. */
export function placeOf(event?: TrackingStatusEvent | null): string | undefined {
    if (!event) return undefined;
    const parts = [event.city, event.province, event.country].filter(
        (p): p is string => typeof p === 'string' && p.trim().length > 0
    );
    if (parts.length) return parts.join(', ');

    if (isRealPoint(event.location)) {
        const [lng, lat] = event.location!.coordinates as number[];
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
    return undefined;
}

/** Oldest first — D5 asks for a chronological log, so it reads as progression. */
export function sortChronologically(events: TrackingStatusEvent[]): TrackingStatusEvent[] {
    return [...events].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
}

function trackingIdOf(order?: Partial<OrderRecord> | null): string | undefined {
    const tn = order?.tracking_number as { id?: unknown } | null | undefined;
    return tn && typeof tn === 'object' && typeof tn.id === 'string' ? tn.id : undefined;
}

export type TimelineState = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

export function useOrderTimeline(orderId: string) {
    const { adapter } = useFleetbase();
    const order = useOrder(orderId);
    const [state, setState] = useState<TimelineState>('idle');
    const [error, setError] = useState<string | null>(null);
    const inFlight = useRef(false);

    const embedded = (order?.tracking_statuses as TrackingStatusEvent[] | undefined) ?? undefined;
    const trackingId = trackingIdOf(order);

    const events = useMemo(() => (embedded ? sortChronologically(embedded) : undefined), [embedded]);

    const load = useCallback(
        async (mode: 'loading' | 'refreshing' = 'refreshing') => {
            if (!trackingId || inFlight.current) return;
            inFlight.current = true;
            setState(mode);
            setError(null);
            try {
                const raw = (await adapter.get('tracking-statuses', { tracking_number: trackingId })) as unknown;
                const rows = Array.isArray(raw) ? raw : ((raw as { data?: unknown[] })?.data ?? []);
                // Merged into the order so every screen sees the same history.
                orderStore.upsert({ id: orderId, tracking_statuses: rows } as never);
                setState('ready');
            } catch (err) {
                setError((err as Error)?.message ?? String(err));
                setState('error');
            } finally {
                inFlight.current = false;
            }
        },
        [adapter, orderId, trackingId]
    );

    useEffect(() => {
        // Embedded data means the screen is never blank while this runs.
        void load(embedded?.length ? 'refreshing' : 'loading');
        // Deliberately keyed on the tracking id alone: re-running on every
        // `embedded` change would loop, since the load writes it back.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trackingId]);

    return {
        events,
        state,
        error,
        isLoading: state === 'loading' && !events,
        isRefreshing: state === 'refreshing',
        failed: state === 'error',
        /** Nothing to show and nothing coming. */
        isEmpty: !!events && events.length === 0,
        refresh: useCallback(() => load('refreshing'), [load]),
    };
}
