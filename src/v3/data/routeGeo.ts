/**
 * Straight-line geometry for the route surface.
 *
 * Two jobs, and both are deliberately *not* routing calls:
 *
 *   1. The optimise preview. `POST /v1/manifests/{id}/optimize` re-sequences
 *      the server's copy and returns it — there is no dry run. The design
 *      (R2 B3) shows before and after and asks the driver to confirm, so the
 *      proposed order is computed here, with the same nearest-neighbour walk
 *      the server runs, and the server is only asked once the driver applies.
 *      The server's answer still wins: the manifest is re-read after applying.
 *
 *   2. Arrival geofencing (R2 C6). "You are 340 m from the stop" is a distance
 *      between two coordinates, and a road lookup for that would be a network
 *      round trip on the one tap that most needs to work without signal.
 *
 * Distances are metres, as the API stores them.
 */
import type { GeoPointLike, ManifestRecord, ManifestStopRecord } from './manifestStore';

export interface LatLng {
    latitude: number;
    longitude: number;
}

const EARTH_RADIUS_M = 6371000;

export function haversineM(from: LatLng, to: LatLng): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const lat1 = toRad(from.latitude);
    const lat2 = toRad(to.latitude);
    const dLat = lat2 - lat1;
    const dLon = toRad(to.longitude - from.longitude);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * GeoJSON is [longitude, latitude]. `[0, 0]` is the API's own placeholder for
 * "unknown" and is treated as no position rather than a point off Ghana.
 */
export function coordsOfPoint(point?: GeoPointLike | null): LatLng | undefined {
    const c = point?.coordinates;
    if (!c || c.length < 2) return undefined;
    const longitude = Number(c[0]);
    const latitude = Number(c[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
    if (latitude === 0 && longitude === 0) return undefined;
    return { latitude, longitude };
}

export function coordsOfStop(stop?: ManifestStopRecord | null): LatLng | undefined {
    return coordsOfPoint(stop?.place?.location);
}

export const DONE_STOP_STATUSES = new Set(['completed', 'skipped']);

export function isStopDone(stop: ManifestStopRecord): boolean {
    return DONE_STOP_STATUSES.has(String(stop.status ?? ''));
}

/**
 * The server's optimise, reproduced: done stops keep the front of the
 * sequence; the rest are walked nearest-first from `from` (the driver's
 * position, or the first pending stop when there is none). Fewer than three
 * pending stops is left alone, exactly as the server leaves it.
 *
 * Returns the stops in their proposed order with a dense `sequence`, so it can
 * be rendered by the same list as the current order.
 */
export function nearestFirst(stops: ManifestStopRecord[], from?: LatLng): ManifestStopRecord[] {
    const done = stops.filter(isStopDone);
    const pending = stops.filter((s) => !isStopDone(s));
    if (pending.length < 3) return stops;

    let cursor = from ?? coordsOfStop(pending[0]);
    const remaining = [...pending];
    const ordered: ManifestStopRecord[] = [];

    while (remaining.length) {
        let closestIndex = 0;
        let closestCost: number | null = null;
        remaining.forEach((stop, index) => {
            const to = coordsOfStop(stop);
            if (!cursor || !to) return;
            const cost = haversineM(cursor, to);
            if (closestCost === null || cost < closestCost) {
                closestCost = cost;
                closestIndex = index;
            }
        });
        const next = remaining.splice(closestIndex, 1)[0];
        ordered.push(next);
        cursor = coordsOfStop(next) ?? cursor;
    }

    let sequence = 1;
    return [...done, ...ordered].map((s) => ({ ...s, sequence: sequence++ }));
}

/** Straight-line length of the pending part of a route, from `from` if given. */
export function routeLengthM(stops: ManifestStopRecord[], from?: LatLng): number | undefined {
    const pending = stops.filter((s) => !isStopDone(s));
    let cursor = from;
    let total = 0;
    let legs = 0;
    for (const stop of pending) {
        const to = coordsOfStop(stop);
        if (!to) continue;
        if (cursor) {
            total += haversineM(cursor, to);
            legs += 1;
        }
        cursor = to;
    }
    return legs ? total : undefined;
}

export interface OptimisePreview {
    before: ManifestStopRecord[];
    after: ManifestStopRecord[];
    /** Ids of the stops whose position changed. */
    moved: Set<string>;
    beforeLengthM?: number;
    afterLengthM?: number;
    /** Negative when the proposed order is shorter. */
    deltaM?: number;
    /** Time delta, estimated at the manifest's own average speed. */
    deltaS?: number;
    /** Nothing to do: too few pending stops, or the order is already nearest-first. */
    unchanged: boolean;
}

export function previewOptimise(manifest: ManifestRecord | undefined, from?: LatLng): OptimisePreview {
    const before = manifest?.stops ?? [];
    const after = nearestFirst(before, from);
    const moved = new Set<string>();
    before.forEach((stop, i) => {
        if (after[i]?.id !== stop.id) moved.add(stop.id);
    });

    const beforeLengthM = routeLengthM(before, from);
    const afterLengthM = routeLengthM(after, from);
    const deltaM = beforeLengthM != null && afterLengthM != null ? afterLengthM - beforeLengthM : undefined;

    /*
     * The manifest knows its planned distance and duration, so a metre saved
     * can be turned into seconds at the plan's own average speed. It is an
     * estimate and the screen labels it as one; it is not invented when the
     * plan has no totals to estimate from.
     */
    const distance = Number(manifest?.total_distance_m);
    const duration = Number(manifest?.total_duration_s);
    const deltaS =
        deltaM != null && Number.isFinite(distance) && Number.isFinite(duration) && distance > 0 && duration > 0
            ? Math.round((deltaM / distance) * duration)
            : undefined;

    return { before, after, moved, beforeLengthM, afterLengthM, deltaM, deltaS, unchanged: moved.size === 0 };
}

/** R2 C6: inside this radius arrival is unremarkable; outside it, the driver is asked. */
export const ARRIVAL_RADIUS_M = 120;

export type ArrivalCheck =
    | { kind: 'in-range'; distanceM: number }
    | { kind: 'out-of-range'; distanceM: number }
    | { kind: 'no-position' }
    | { kind: 'no-stop-location' };

export function checkArrival(stop: ManifestStopRecord | undefined, position: LatLng | null | undefined): ArrivalCheck {
    const target = coordsOfStop(stop);
    if (!target) return { kind: 'no-stop-location' };
    if (!position) return { kind: 'no-position' };
    const distanceM = haversineM(position, target);
    return distanceM <= ARRIVAL_RADIUS_M ? { kind: 'in-range', distanceM } : { kind: 'out-of-range', distanceM };
}

/** "50.640152, -2.057361" — six places, the precision a driver can act on. */
export function formatLatLng(point?: LatLng | null): string | undefined {
    if (!point) return undefined;
    return `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`;
}
