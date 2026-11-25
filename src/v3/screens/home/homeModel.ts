/**
 * The driver's day, worked out from what is already loaded.
 *
 * A driver may have a manifest (a sequenced route), loose orders, or both. The
 * dashboard needs one answer to "where next" and "how far through am I", so
 * both are flattened into the same list of waypoints: the manifest's stops in
 * their sequence first, then the waypoints of every order the manifest does not
 * already cover.
 *
 * Nothing here asks the server anything, and nothing is estimated: a figure the
 * records do not carry is left undefined so the screen can leave it out.
 */
import {
    cashOnDeliveryOf,
    coordsOfPoint,
    currentStop,
    haversineM,
    isOrderAbandoned,
    isOrderFinished,
    isStopDone,
    payloadOf,
    scheduledDayOf,
    trackingNumberOf,
    bucketOf,
    type LatLng,
    type ManifestRecord,
    type OrderRecord,
    type TrackerRecord,
} from '../../data';
import { dayKey } from '../../data/orderStore';

export type WaypointKind = 'pickup' | 'dropoff' | 'waypoint';

export interface HomeWaypoint {
    /** Stable across renders: the manifest stop id, or order id + position. */
    key: string;
    source: 'manifest' | 'order';
    manifestId?: string;
    stopId?: string;
    orderId?: string;
    placeId?: string;
    kind?: WaypointKind;
    name?: string;
    address?: string;
    point?: LatLng;
    done: boolean;
    skipped?: boolean;
    trackingNumber?: string;
    /** The manifest's planned arrival at this waypoint. */
    plannedAt?: string | null;
    /** The end of the waypoint's time window, when dispatch set one. */
    windowEnd?: string | null;
    /** Position in the day, from 1. */
    number: number;
}

export interface CashTotal {
    currency?: string;
    /** Minor units, as the API sends amounts. */
    amount: number;
    orders: number;
}

export interface HomeDay {
    manifest?: ManifestRecord;
    waypoints: HomeWaypoint[];
    total: number;
    done: number;
    skipped: number;
    /** The waypoint being headed to. */
    next?: HomeWaypoint;
    /** The few after it. */
    upcoming: HomeWaypoint[];
    orderCount: number;
    finishedOrderCount: number;
    /** When the first waypoint is planned for, if anything says. */
    firstAt?: string;
    /** When the last one is planned for. */
    finishAt?: string;
    plannedDistanceM?: number;
    plannedDurationS?: number;
    /** There was work, and all of it is done. */
    allDone: boolean;
    /** Cash on delivery across the day's completed orders, per currency. */
    cash: CashTotal[];
}

type Rec = Record<string, unknown>;

const str = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined);

/** Which of today's manifests is the one being worked: running, then released, then the rest. */
const MANIFEST_ORDER = ['in_progress', 'active', 'draft', 'completed'];

export function pickTodayManifest(manifests: ManifestRecord[], today: string = dayKey()): ManifestRecord | undefined {
    const candidates = manifests.filter((m) => m.status !== 'cancelled' && bucketOf(m, today) === 'today');
    const rank = (m: ManifestRecord) => {
        const index = MANIFEST_ORDER.indexOf(String(m.status ?? ''));
        return index === -1 ? MANIFEST_ORDER.length : index;
    };
    return [...candidates].sort((a, b) => rank(a) - rank(b) || String(scheduledDayOf(b) ?? '').localeCompare(String(scheduledDayOf(a) ?? '')))[0];
}

function manifestWaypoints(manifest: ManifestRecord): HomeWaypoint[] {
    return (manifest.stops ?? []).map((stop, index) => ({
        key: `stop:${stop.id}`,
        source: 'manifest' as const,
        manifestId: manifest.id,
        stopId: stop.id,
        orderId: str(stop.order?.id),
        placeId: str(stop.place?.id),
        // The stop's own role (FleetOps 0.7.4 and later), else what the place calls itself.
        kind: (['pickup', 'dropoff', 'waypoint'].includes(String(stop.type))
            ? stop.type
            : stop.type === 'return'
              ? 'dropoff'
              : ['pickup', 'dropoff'].includes(String(stop.place?.type))
                ? stop.place?.type
                : undefined) as WaypointKind | undefined,
        name: str(stop.place?.name),
        address: str(stop.place?.address) ?? str(stop.place?.street1),
        point: coordsOfPoint(stop.place?.location),
        done: isStopDone(stop),
        skipped: stop.status === 'skipped',
        trackingNumber: str(stop.order?.tracking_number),
        windowEnd: str(stop.time_window_end) ?? null,
        plannedAt: stop.estimated_arrival ?? null,
        number: index + 1,
    }));
}

/**
 * An order's waypoints in the order a driver works them: pickup, the waypoints
 * between, drop-off. Everything before `current_waypoint` is behind the driver;
 * a waypoint the server has marked `complete` is too.
 */
function orderWaypoints(order: OrderRecord): HomeWaypoint[] {
    const payload = payloadOf(order) as Rec;
    const places: { place: Rec; kind: WaypointKind }[] = [];
    const push = (place: unknown, kind: WaypointKind) => {
        if (place && typeof place === 'object') places.push({ place: place as Rec, kind });
    };
    push(payload.pickup, 'pickup');
    for (const waypoint of (payload.waypoints as unknown[] | undefined) ?? []) push(waypoint, 'waypoint');
    push(payload.dropoff, 'dropoff');

    const finished = isOrderFinished(order);
    const current = str(payload.current_waypoint);
    const currentIndex = Math.max(0, places.findIndex(({ place }) => !!place.id && place.id === current));
    const trackingNumber = trackingNumberOf(order);

    return places.map(({ place, kind }, index) => ({
        key: `order:${order.id}:${index}`,
        source: 'order' as const,
        orderId: order.id,
        placeId: str(place.id),
        kind,
        name: str(place.name),
        address: str(place.address) ?? str(place.street1),
        point: coordsOfPoint(place.location as { coordinates?: number[] } | null),
        done: finished || index < currentIndex || place.complete === true,
        trackingNumber,
        windowEnd: str(place.time_window_end) ?? null,
        number: 0,
    }));
}

/** Work in hand first, then by when it is scheduled, then by when it was created. */
function byWorkOrder(a: OrderRecord, b: OrderRecord): number {
    const started = (o: OrderRecord) => (o.started_at || (o as Rec).started === true ? 0 : 1);
    const when = (o: OrderRecord) => String(o.scheduled_at ?? '￿');
    return started(a) - started(b) || when(a).localeCompare(when(b)) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
}

function earliest(values: (string | null | undefined)[]): string | undefined {
    return values.filter((v): v is string => !!v).sort()[0];
}

export function buildDay({
    manifest,
    activeOrders,
    dayOrders,
}: {
    manifest?: ManifestRecord;
    /** Orders in hand, whatever day they were made. */
    activeOrders: OrderRecord[];
    /** Orders scheduled for or created today, finished ones included. */
    dayOrders: OrderRecord[];
}): HomeDay {
    const fromManifest = manifest ? manifestWaypoints(manifest) : [];
    const covered = new Set(fromManifest.map((w) => w.orderId).filter(Boolean) as string[]);

    const seen = new Set<string>();
    const orders = [...activeOrders, ...dayOrders].filter((order) => {
        if (!order?.id || seen.has(order.id) || isOrderAbandoned(order)) return false;
        seen.add(order.id);
        return true;
    });
    const loose = orders.filter((order) => !covered.has(order.id)).sort(byWorkOrder);

    const waypoints = [...fromManifest, ...loose.flatMap(orderWaypoints)].map((w, index) => ({ ...w, number: index + 1 }));

    // A manifest read from the list has counters but no stops yet; count from those until the stops arrive.
    const unloaded = manifest && !manifest.stops?.length;
    const extraTotal = unloaded ? Number(manifest?.stop_count ?? 0) || 0 : 0;
    const extraDone = unloaded ? Number(manifest?.completed_stops ?? 0) || 0 : 0;

    const total = waypoints.length + extraTotal;
    const done = waypoints.filter((w) => w.done).length + extraDone;
    // An arrived manifest stop is where the driver is; otherwise the first one not done.
    const arrivedId = manifest?.stops?.find((s) => s.status === 'arrived')?.id;
    const pending = waypoints.filter((w) => !w.done);
    const next = pending.find((w) => arrivedId && w.stopId === arrivedId) ?? pending[0];

    const orderIds = new Set<string>([...covered, ...loose.map((o) => o.id)]);
    const finishedLoose = loose.filter((o) => isOrderFinished(o));
    const finishedCovered = [...covered].filter((id) => {
        const order = orders.find((o) => o.id === id);
        return order ? isOrderFinished(order) : false;
    });

    const cashByCurrency = new Map<string, CashTotal>();
    for (const order of orders) {
        if (!isOrderFinished(order)) continue;
        const cash = cashOnDeliveryOf(order);
        if (!cash) continue;
        const key = cash.currency ?? '';
        const row = cashByCurrency.get(key) ?? { currency: cash.currency, amount: 0, orders: 0 };
        row.amount += cash.amount;
        row.orders += 1;
        cashByCurrency.set(key, row);
    }

    const pendingPlanned = fromManifest.filter((w) => !w.done && w.plannedAt);

    return {
        manifest,
        waypoints,
        total,
        done,
        skipped: waypoints.filter((w) => w.skipped).length,
        next,
        upcoming: pending.filter((w) => w !== next).slice(0, 3),
        orderCount: orderIds.size,
        finishedOrderCount: finishedLoose.length + finishedCovered.length,
        firstAt: fromManifest.find((w) => w.plannedAt)?.plannedAt ?? earliest(loose.filter((o) => !isOrderFinished(o)).map((o) => o.scheduled_at)),
        finishAt: pendingPlanned.length ? (pendingPlanned[pendingPlanned.length - 1].plannedAt ?? undefined) : undefined,
        plannedDistanceM: manifest?.total_distance_m ?? undefined,
        plannedDurationS: manifest?.total_duration_s ?? undefined,
        allDone: total > 0 && done >= total,
        cash: [...cashByCurrency.values()],
    };
}

/** How close the tracker's stop must be to the waypoint to be called the same place. */
const SAME_PLACE_M = 150;

/**
 * Is the tracker talking about this waypoint?
 *
 * The tracker's ETA is to the *order's* active stop. A manifest can sequence an
 * order's drop-off while the order itself still points at its pickup, and then
 * the tracker's arrival time belongs to a different place. It is only shown
 * when the two agree.
 */
export function trackerIsFor(tracker: TrackerRecord | null | undefined, waypoint?: HomeWaypoint): boolean {
    const stop = currentStop(tracker);
    if (!stop || !waypoint) return false;
    if (waypoint.placeId && stop.public_id === waypoint.placeId) return true;
    const point = stop.latitude != null && stop.longitude != null ? { latitude: Number(stop.latitude), longitude: Number(stop.longitude) } : coordsOfPoint(stop.location);
    if (!point || !waypoint.point) return false;
    return haversineM(point, waypoint.point) <= SAME_PLACE_M;
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPart(now: Date = new Date()): DayPart {
    const hour = now.getHours();
    return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}

/** "Ronald" from "Ronald A. Richardson": a greeting uses the first name. */
export function firstNameOf(name?: string | null): string | undefined {
    return str(name)?.trim().split(/\s+/)[0];
}

/** Seconds between two timestamps, when both parse and the second is later. */
export function secondsBetween(from?: string | null, to?: string | null): number | undefined {
    if (!from || !to) return undefined;
    const a = Date.parse(from);
    const b = Date.parse(to);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return undefined;
    return Math.round((b - a) / 1000);
}
