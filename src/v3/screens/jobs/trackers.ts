/**
 * The Jobs screens' trackers: one answer per order, shared by every view.
 *
 * An order's tracker (`GET orders/{id}/tracker`) carries the road route from
 * the driver through the order's remaining waypoints, and the distance and
 * time of each leg. The order cards want the legs and the Map wants the road,
 * so both read the same answer from here and an order is asked for once.
 *
 * It costs a routing call on the server, so it is rationed:
 *
 *   - only the orders a view names are asked for, and each view caps how many
 *     it names (`ORDER_CARD_TRACKERS`, `MAP_TRACKERS`);
 *   - an answer is kept for the session and reused by every card and by the
 *     map. It is asked again only when the order has moved on (one of its
 *     waypoints was finished: the `version`), or when a view is opened and the
 *     answer is more than a few minutes old. Nothing here polls or runs on a
 *     timer, and a render never causes a request by itself;
 *   - a request that failed is remembered like an answer, so a server without
 *     a tracker is not asked on every visit.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useFleetbase } from '../../api';
import type { TrackerRecord } from '../../data/useTracker';

/** Order cards: the current job and the next few. */
export const ORDER_CARD_TRACKERS = 5;
/** The map: the unfinished orders drawn on it. */
export const MAP_TRACKERS = 6;

/** An answer older than this is asked again the next time a view names the order. */
const STALE_MS = 3 * 60 * 1000;

interface Entry {
    tracker: TrackerRecord | null;
    /** What the order looked like when it was asked: its count of finished waypoints. */
    version: string;
    at: number;
    loading: boolean;
}

export interface TrackerRequest {
    id: string;
    /** Changes when the order moves on, so the legs are asked again. */
    version: string | number;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let revision = 0;
/** The connection the answers came from: a rebuilt connection (another server) starts clean. */
let source: unknown;

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function publish() {
    revision += 1;
    listeners.forEach((listener) => listener());
}

const getRevision = () => revision;

type Adapter = { get: (path: string) => Promise<unknown> };

function ask(adapter: Adapter, id: string, version: string) {
    const known = entries.get(id);
    if (known?.loading) return;
    if (known && known.version === version && Date.now() - known.at < STALE_MS) return;
    // The last answer stays on show while the new one is fetched.
    entries.set(id, { tracker: known?.tracker ?? null, version, at: known?.at ?? 0, loading: true });
    const asked = source;
    adapter
        .get(`orders/${id}/tracker`)
        .then((raw) => (((raw as { data?: unknown })?.data ?? raw) ?? null) as TrackerRecord | null)
        .catch(() => null)
        .then((tracker) => {
            // The connection was rebuilt while it was on its way: not this session's answer.
            if (asked !== source) return;
            entries.set(id, { tracker, version, at: Date.now(), loading: false });
            publish();
        });
}

/**
 * Asks for the trackers of the orders named (already capped by the caller) and
 * returns what is known, by order id. An order with no answer yet, or whose
 * request failed, is simply not in the map. With `enabled` false (offline)
 * nothing is asked and what is already held is still returned.
 */
export function useJobTrackers(requests: TrackerRequest[], enabled = true): Map<string, TrackerRecord> {
    const { adapter } = useFleetbase();
    const key = requests.map((r) => `${r.id}@${r.version}`).join('|');
    const seen = useSyncExternalStore(subscribe, getRevision, getRevision);

    useEffect(() => {
        if (source !== adapter) {
            source = adapter;
            entries.clear();
        }
        if (!key || !enabled) return;
        for (const part of key.split('|')) {
            const at = part.lastIndexOf('@');
            ask(adapter as Adapter, part.slice(0, at), part.slice(at + 1));
        }
    }, [adapter, key, enabled]);

    return useMemo(() => {
        const found = new Map<string, TrackerRecord>();
        if (!key) return found;
        for (const part of key.split('|')) {
            const id = part.slice(0, part.lastIndexOf('@'));
            const tracker = entries.get(id)?.tracker;
            if (tracker) found.set(id, tracker);
        }
        return found;
        // `seen` is the cache's revision: the map is rebuilt when an answer arrives.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, seen]);
}

/** The tracker already held for an order, if any view has asked for it. Never asks. */
export function useCachedTracker(orderId?: string): TrackerRecord | null {
    return useSyncExternalStore(
        subscribe,
        () => (orderId ? (entries.get(orderId)?.tracker ?? null) : null),
        () => null
    );
}

/* -- Legs: how far and how long to each place. ------------------------------ */

export interface PlaceLeg {
    distanceM?: number;
    durationS?: number;
}

const positive = (value: unknown): number | undefined => {
    const n = Number(value);
    return value != null && Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * The tracker's legs by place id. There is one leg per remaining waypoint in
 * driving order, the first from the driver to the waypoint being headed to,
 * each later one from the waypoint before it. A leg names its waypoint; when
 * the server does not, the legs are matched to `remaining` (the order's places
 * not yet done, in order) by position, and only when the two lists agree in
 * length, so a figure is never put beside the wrong place.
 */
export function trackerLegs(tracker: TrackerRecord | null | undefined, remaining: (string | undefined)[]): Map<string, PlaceLeg> {
    const legs = new Map<string, PlaceLeg>();
    const list = tracker?.route?.legs ?? [];
    if (!list.length) return legs;
    const wanted = new Set(remaining.filter(Boolean) as string[]);
    const named = list.some((leg) => leg?.stop?.public_id || leg?.stop?.uuid);
    list.forEach((leg, index) => {
        if (!leg) return;
        const id = named ? [leg.stop?.public_id, leg.stop?.uuid].find((candidate) => candidate && wanted.has(candidate)) : list.length === remaining.length ? remaining[index] : undefined;
        if (!id) return;
        const distanceM = positive(leg.distance_m);
        const durationS = positive(leg.duration_in_traffic_s) ?? positive(leg.duration_s);
        if (distanceM != null || durationS != null) legs.set(id, { distanceM, durationS });
    });
    return legs;
}
