/**
 * The road a manifest's waypoints are joined by.
 *
 * `GET /v1/manifests/{id}/route` (FleetOps 0.7.4 and later) answers with the
 * route through the manifest's waypoints from the organisation's routing
 * engine: one encoded line for the whole day and, when the server can give it,
 * one per leg, so a map can draw the part behind the driver, the leg being
 * driven and the part still to come differently.
 *
 * Three things this hook is careful about:
 *
 *   - **It asks rarely.** The line only changes when the waypoints are
 *     re-ordered or one is finished, so the answer is kept for the session
 *     under exactly that, and shared by every map that shows the same
 *     manifest. Opening the map again costs nothing.
 *   - **It never blanks a map.** While a new answer is on its way the last
 *     good one stays up.
 *   - **It fails quietly.** An older server has no such endpoint (404), a
 *     server with no routing engine answers with no line, and a driver may
 *     simply have no signal. In every case the hook returns nothing and the
 *     map falls back to dashed straight lines; none of them is an error worth
 *     a log line or a banner.
 */
import { useEffect, useMemo, useState } from 'react';
import { useFleetbase } from '../api';
import { DONE_STOP_STATUSES, decodePolyline, type LatLng } from './routeGeo';

export interface ManifestRouteLeg {
    /** The waypoint the leg starts at. Null when it starts at the driver's position. */
    fromStop: string | null;
    toStop: string | null;
    distanceM?: number;
    durationS?: number;
    /** Empty when the server sent no line for this leg. */
    coordinates: LatLng[];
}

export interface ManifestRoute {
    /** The whole route as one line. */
    coordinates: LatLng[];
    legs: ManifestRouteLeg[];
    /** Every leg has its own line, so legs can be drawn in different styles. */
    hasLegGeometry: boolean;
    distanceM?: number;
    durationS?: number;
    provider?: string;
    warnings: string[];
    generatedAt?: string;
}

export interface ManifestRouteStop {
    id: string;
    status?: string | null;
}

interface Entry {
    route: ManifestRoute | null;
    at: number;
    /** An answer without a line, or no answer at all: worth asking again after a while. */
    retry: boolean;
}

/** How long "no line" is believed before the server is asked again. */
const RETRY_AFTER_MS = 60_000;

const answers = new Map<string, Entry>();
const lastGood = new Map<string, { order: string; route: ManifestRoute }>();
const inFlight = new Map<string, Promise<void>>();
/** Manifests whose server answered 404: it has no route endpoint, so it is not asked again this session. */
const unsupported = new Set<string>();

function num(value: unknown): number | undefined {
    const n = Number(value);
    return value != null && Number.isFinite(n) ? n : undefined;
}

/** The server's answer as the maps use it, or null when it carries no line to draw. */
export function parseManifestRoute(raw: unknown): ManifestRoute | null {
    const body = ((raw as { data?: unknown })?.data ?? raw) as Record<string, unknown> | null | undefined;
    if (!body || typeof body !== 'object') return null;

    const legs: ManifestRouteLeg[] = (Array.isArray(body.legs) ? (body.legs as Record<string, unknown>[]) : []).map((leg) => ({
        fromStop: typeof leg?.from_stop === 'string' ? leg.from_stop : null,
        toStop: typeof leg?.to_stop === 'string' ? leg.to_stop : null,
        distanceM: num(leg?.distance_m),
        durationS: num(leg?.duration_s),
        coordinates: decodePolyline(typeof leg?.polyline === 'string' ? leg.polyline : null),
    }));
    const hasLegGeometry = legs.length > 0 && legs.every((leg) => leg.coordinates.length > 1);
    const whole = decodePolyline(typeof body.polyline === 'string' ? body.polyline : null);
    const coordinates = whole.length > 1 ? whole : hasLegGeometry ? legs.flatMap((leg) => leg.coordinates) : [];
    if (coordinates.length < 2) return null;

    return {
        coordinates,
        legs,
        hasLegGeometry,
        distanceM: num(body.distance_m),
        durationS: num(body.duration_s),
        provider: typeof body.provider === 'string' ? body.provider : undefined,
        warnings: Array.isArray(body.warnings) ? (body.warnings as unknown[]).map(String) : [],
        generatedAt: typeof body.generated_at === 'string' ? body.generated_at : undefined,
    };
}

export type RouteRunKind = 'done' | 'now' | 'later';

export interface RouteRun {
    kind: RouteRunKind;
    coordinates: LatLng[];
}

/**
 * The route cut into stretches a map draws in one style each. A leg takes the
 * state of the waypoint it leads to; neighbouring legs in the same state are
 * joined so a twenty-waypoint day is a handful of lines, not twenty.
 *
 * Without a line per leg there is nothing to cut, and the whole route comes
 * back as one stretch of `whole`.
 */
export function routeRuns(route: ManifestRoute, kindOf: (stopId: string | null) => RouteRunKind, whole: RouteRunKind = 'now'): RouteRun[] {
    if (!route.hasLegGeometry) return [{ kind: whole, coordinates: route.coordinates }];
    const runs: RouteRun[] = [];
    for (const leg of route.legs) {
        const kind = kindOf(leg.toStop);
        const previous = runs[runs.length - 1];
        if (previous?.kind === kind) previous.coordinates = [...previous.coordinates, ...leg.coordinates];
        else runs.push({ kind, coordinates: leg.coordinates });
    }
    return runs;
}

/** Exposed so tests can start from a known state. */
export function clearManifestRoutes(): void {
    answers.clear();
    lastGood.clear();
    inFlight.clear();
    unsupported.clear();
}

export interface UseManifestRouteOptions {
    /** Only the waypoints still to do, starting from the driver's last known position. */
    remaining?: boolean;
}

export function useManifestRoute(manifestId: string | undefined, stops: ManifestRouteStop[], { remaining = false }: UseManifestRouteOptions = {}): { route: ManifestRoute | null; isLoading: boolean } {
    const { adapter } = useFleetbase();
    const [, setRevision] = useState(0);

    // What the line depends on: the waypoints in driving order, and which are behind the driver.
    const order = useMemo(() => stops.map((stop) => stop.id).join(','), [stops]);
    const signature = useMemo(() => stops.map((stop) => `${stop.id}${DONE_STOP_STATUSES.has(String(stop.status ?? '')) ? ':d' : ''}`).join(','), [stops]);
    const scope = manifestId ? `${manifestId}|${remaining ? 1 : 0}` : undefined;
    // One waypoint has no route to draw.
    const key = scope && stops.length > 1 && !unsupported.has(manifestId as string) ? `${scope}|${signature}` : undefined;

    useEffect(() => {
        if (!key || !scope || !manifestId) return undefined;
        const known = answers.get(key);
        if (known && !(known.retry && Date.now() - known.at > RETRY_AFTER_MS)) return undefined;

        let alive = true;
        let request = inFlight.get(key);
        if (!request) {
            request = (async () => {
                try {
                    const route = parseManifestRoute(await adapter.get(`manifests/${manifestId}/route`, remaining ? { remaining: 1 } : undefined));
                    if (route) lastGood.set(scope, { order, route });
                    answers.set(key, { route, at: Date.now(), retry: !route });
                } catch (err) {
                    if ((err as { status?: number })?.status === 404) unsupported.add(manifestId);
                    // No answer: a line drawn for these same waypoints in this order is still
                    // right, so it stays. One drawn for a different order would be a lie.
                    const last = lastGood.get(scope);
                    answers.set(key, { route: last?.order === order ? last.route : null, at: Date.now(), retry: true });
                } finally {
                    inFlight.delete(key);
                    // Answers are keyed by sequence, so a long day of re-ordering would pile them up.
                    if (answers.size > 24) for (const old of [...answers.keys()].slice(0, answers.size - 24)) answers.delete(old);
                }
            })();
            inFlight.set(key, request);
        }
        setRevision((n) => n + 1);
        void request.then(() => {
            if (alive) setRevision((n) => n + 1);
        });
        return () => {
            alive = false;
        };
        // `order` and `remaining` are part of `key`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adapter, key]);

    if (!key || !scope) return { route: null, isLoading: false };
    const answer = answers.get(key);
    // Until the new answer lands, the last good line for this manifest stays on the map.
    const route = answer ? answer.route : (lastGood.get(scope)?.route ?? null);
    return { route, isLoading: !answer && inFlight.has(key) };
}
