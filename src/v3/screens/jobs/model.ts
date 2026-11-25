/**
 * What the Jobs screens draw, worked out once from what the server sends.
 *
 * Two views of the same work:
 *
 *   - an order's **points** — its pickup, waypoints and drop-off in the order a
 *     driver works through them, each done, being headed to, or still to do;
 *   - the day's **waypoints** — every place in driving order across orders,
 *     from the manifest when dispatch built one, otherwise from the active
 *     orders one after another.
 *
 * An order comes in four shapes and all of them go through the same list
 * (Payload.php / Waypoint.php on the server): pickup + drop-off, pickup +
 * waypoints + drop-off, pickup + waypoints, and waypoints only.
 *
 * How "done" is known, since the server says it in two different ways:
 *
 *   - a waypoint carries its own `complete` flag (Waypoint resource), so that
 *     is believed outright;
 *   - a pickup or drop-off carries none. `payload.current_waypoint` is the
 *     place being headed to, so anything before it on a started order is
 *     behind the driver, and everything is done once the order is finished.
 */
import {
    cashOnDeliveryOf,
    coordsOfPoint,
    currentManifestStop,
    isOrderAbandoned,
    isOrderFinished,
    orderConfigIdOf,
    payloadOf,
    trackingNumberOf,
    type CashOnDelivery,
    type LatLng,
    type ManifestStopRecord,
    type OrderRecord,
} from '../../data';
import { cachedOrderConfig } from '../../data/orderConfigCache';
import { humanizeStatus } from '../../theme/status';

export type PointRole = 'pickup' | 'waypoint' | 'dropoff';
export type PointState = 'done' | 'current' | 'later' | 'skipped';

interface RawPlace {
    id?: string;
    name?: string | null;
    address?: string | null;
    location?: { type?: string; coordinates?: number[] } | null;
    /** Waypoints only: the server's own word on whether this one is finished. */
    complete?: boolean | null;
    time_window_start?: string | null;
    time_window_end?: string | null;
}

export interface OrderPoint {
    /** Place id — what `current_waypoint` holds and a manifest stop's place carries. */
    id?: string;
    role: PointRole;
    state: PointState;
    name?: string;
    address?: string;
    point?: LatLng;
    /** 1-based position among the order's waypoints, for "Waypoint 1 of 2". */
    waypointNumber?: number;
    waypointTotal?: number;
    /** End of the waypoint's time window, when dispatch set one. */
    windowEnd?: string;
    /** Items handled here: everything at a pickup, otherwise the entities bound for this place. */
    itemCount?: number;
}

function text(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

/** True once the driver has started the order. */
export function isOrderStarted(order?: Partial<OrderRecord> | null): boolean {
    return Boolean(order?.started_at || (order as { started?: unknown } | undefined)?.started);
}

/** Every point on the order, in working order, with its state. */
export function orderPoints(order?: Partial<OrderRecord> | null): OrderPoint[] {
    if (!order) return [];
    const payload = payloadOf(order) as { pickup?: RawPlace | null; dropoff?: RawPlace | null; waypoints?: RawPlace[] | null; current_waypoint?: string | null };
    const raw: { place: RawPlace; role: PointRole }[] = [];
    if (payload.pickup) raw.push({ place: payload.pickup, role: 'pickup' });
    for (const waypoint of payload.waypoints ?? []) if (waypoint) raw.push({ place: waypoint, role: 'waypoint' });
    if (payload.dropoff) raw.push({ place: payload.dropoff, role: 'dropoff' });
    if (!raw.length) return [];

    const completed = isOrderFinished(order) && !isOrderAbandoned(order as { status?: string });
    const started = isOrderStarted(order);
    const flagged = (place: RawPlace) => (typeof place.complete === 'boolean' ? place.complete : undefined);

    // Where the driver is heading: the server's answer, else the first point not known to be done.
    let heading = raw.findIndex(({ place }) => !!place.id && place.id === payload.current_waypoint);
    if (heading < 0 || flagged(raw[heading].place) === true) heading = raw.findIndex(({ place }) => flagged(place) !== true);
    // Every point is flagged complete: all of them are behind the driver.
    if (heading < 0) heading = raw.length;

    const waypointTotal = raw.filter((r) => r.role === 'waypoint').length;
    let waypointNumber = 0;

    /*
     * An entity names the place it is bound for (`destination`, a place id —
     * Entity.php). On a plain pickup → drop-off order entities usually name
     * none, and then everything goes to the drop-off.
     */
    const entities = ((payloadOf(order).entities ?? []) as { destination?: unknown }[]).filter(Boolean);
    const anyBound = entities.some((e) => text(e.destination));
    const itemsAt = (place: RawPlace, role: PointRole): number | undefined => {
        if (!entities.length) return undefined;
        if (role === 'pickup') return entities.length;
        if (anyBound) return entities.filter((e) => !!place.id && e.destination === place.id).length || undefined;
        return role === 'dropoff' ? entities.length : undefined;
    };

    return raw.map(({ place, role }, index) => {
        if (role === 'waypoint') waypointNumber += 1;
        const flag = flagged(place);
        let state: PointState;
        if (completed || flag === true) state = 'done';
        else if (!started) state = 'later';
        else if (index === heading) state = 'current';
        // A waypoint the server says is not complete is not done, wherever it sits.
        else if (index < heading && flag === undefined) state = 'done';
        else state = 'later';
        return {
            id: place.id,
            role,
            state,
            name: text(place.name),
            address: text(place.address),
            point: coordsOfPoint(place.location),
            ...(role === 'waypoint' ? { waypointNumber, waypointTotal } : {}),
            windowEnd: text(place.time_window_end),
            itemCount: itemsAt(place, role),
        };
    });
}

/** The point to show as "next": the one being headed to, else the first still to do. */
export function nextPoint(points: OrderPoint[]): OrderPoint | undefined {
    return points.find((p) => p.state === 'current') ?? points.find((p) => p.state === 'later');
}

export interface OrderShape {
    hasPickup: boolean;
    hasDropoff: boolean;
    waypointCount: number;
}

/** The order's shape, for "Pickup → 2 waypoints → Drop-off". */
export function orderShape(points: OrderPoint[]): OrderShape {
    return {
        hasPickup: points.some((p) => p.role === 'pickup'),
        hasDropoff: points.some((p) => p.role === 'dropoff'),
        waypointCount: points.filter((p) => p.role === 'waypoint').length,
    };
}

/** The order type as a driver would say it: the config's name, else the order's own `type`. */
export function orderTypeLabel(order?: Partial<OrderRecord> | null): string | undefined {
    const config = cachedOrderConfig(orderConfigIdOf(order));
    if (config?.name) return config.name;
    const type = text((order as { type?: unknown } | undefined)?.type);
    return type ? humanizeStatus(type) : undefined;
}

/* -- Which list an order belongs to. --------------------------------------- */

export type OrderSegment = 'active' | 'scheduled' | 'completed';

export function segmentOf(order: OrderRecord): OrderSegment {
    // The order config's `complete` flag decides (see data/orderStatus), so a
    // booking that ends on its own code lands here rather than staying active.
    if (isOrderFinished(order)) return 'completed';
    // Scheduled but not yet dispatched or started.
    if (!order.started_at && !order.dispatched_at && order.scheduled_at) return 'scheduled';
    return 'active';
}

/* -- A stable letter and colour per order. --------------------------------- */

/**
 * The route lists waypoints from several orders, so each order gets a letter
 * and a colour that follow it from the Orders list to the Route and the Map.
 * These are identity marks, not statuses — the tracking number is always
 * beside them — so they are fixed colours with white text on both themes.
 */
const ORDER_TONES = ['#2E63D9', '#8A4B1F', '#1F7A6B', '#5B4BC4', '#9B2C5A', '#4A6072'];

export interface OrderMark {
    letter: string;
    tone: string;
}

export function orderMarks(orders: OrderRecord[]): Map<string, OrderMark> {
    const marks = new Map<string, OrderMark>();
    orders.forEach((order, index) => {
        marks.set(order.id, { letter: String.fromCharCode(65 + (index % 26)), tone: ORDER_TONES[index % ORDER_TONES.length] });
    });
    return marks;
}

/* -- The day's waypoints, in driving order. --------------------------------- */

export interface JobWaypoint {
    key: string;
    /** Position in the driving sequence, as the driver counts it. */
    sequence: number;
    state: PointState;
    /** The driver has marked themselves arrived here (manifest only). */
    arrived?: boolean;
    /** Known only when the waypoint's order is on this device — see `fromManifest`. */
    role?: PointRole;
    /** The leg back to base. It is worked like a drop-off (`role`), but the map marks it R as the console does. */
    isReturn?: boolean;
    waypointNumber?: number;
    waypointTotal?: number;
    name?: string;
    address?: string;
    point?: LatLng;
    eta?: string;
    arrivedAt?: string;
    windowEnd?: string;
    distanceFromPrevM?: number;
    durationFromPrevS?: number;
    orderId?: string;
    trackingNumber?: string;
    /** Items of that order handled at this waypoint, when the order says. */
    itemCount?: number;
    cash?: CashOnDelivery;
    /** Set when the waypoint is a manifest stop, which has a screen of its own. */
    manifestId?: string;
    stopId?: string;
}

function num(value: unknown): number | undefined {
    const n = Number(value);
    return value != null && Number.isFinite(n) ? n : undefined;
}

/** A stop's role as the server names it. A return leg is driven like a drop-off. */
function serverRole(type: unknown): PointRole | undefined {
    if (type === 'pickup' || type === 'waypoint' || type === 'dropoff') return type;
    if (type === 'return') return 'dropoff';
    return undefined;
}

/**
 * The manifest's stops as waypoints.
 *
 * The stop resource says where, when and for which order, but not what the
 * place *is* to that order only from FleetOps 0.7.4 on. For an older server the role is
 * found by matching the stop's place against the order's own pickup, waypoints
 * and drop-off — possible only for an order this device has loaded. Otherwise
 * the row simply has no role, rather than a guessed one.
 */
export function fromManifest(manifestId: string, stops: ManifestStopRecord[], orderOf: (id: string) => OrderRecord | undefined): JobWaypoint[] {
    const current = currentManifestStop(stops);
    return stops.map((stop, index) => {
        const order = stop.order?.id ? orderOf(stop.order.id) : undefined;
        const place = stop.place;
        const match = order && place?.id ? orderPoints(order).find((p) => p.id === place.id) : undefined;
        const state: PointState = stop.status === 'skipped' ? 'skipped' : stop.status === 'completed' ? 'done' : stop.id === current?.id ? 'current' : 'later';
        const cash = (serverRole(stop.type) ?? match?.role) === 'dropoff' || (match && !orderShape(orderPoints(order)).hasDropoff) ? cashOnDeliveryOf(order) : undefined;
        return {
            key: stop.id,
            sequence: num(stop.sequence) ?? index + 1,
            state,
            arrived: stop.status === 'arrived',
            // The server's word first; the match against the order covers an older server.
            role: serverRole(stop.type) ?? match?.role,
            isReturn: stop.type === 'return' || undefined,
            waypointNumber: num(stop.waypoint_index) ?? match?.waypointNumber,
            waypointTotal: num(stop.waypoint_total) ?? match?.waypointTotal,
            name: text(place?.name),
            address: text(place?.address),
            point: coordsOfPoint(place?.location),
            eta: text(stop.estimated_arrival),
            arrivedAt: text(stop.actual_arrival),
            windowEnd: text(stop.time_window_end) ?? match?.windowEnd,
            distanceFromPrevM: num(stop.distance_from_prev_m),
            durationFromPrevS: num(stop.duration_from_prev_s),
            orderId: stop.order?.id,
            trackingNumber: text(stop.order?.tracking_number) ?? trackingNumberOf(order),
            itemCount: match?.itemCount,
            cash: cash?.toCollect ? cash : undefined,
            manifestId,
            stopId: stop.id,
        };
    });
}

/** Started orders first, then by when they are due, then by when they were made. */
export function inWorkingOrder(orders: OrderRecord[]): OrderRecord[] {
    const when = (o: OrderRecord) => String(o.scheduled_at ?? o.dispatched_at ?? o.created_at ?? '');
    return [...orders].sort((a, b) => Number(isOrderStarted(b)) - Number(isOrderStarted(a)) || when(a).localeCompare(when(b)));
}

/**
 * No manifest: the active orders' own points, one order after another. This is
 * the order of the orders, not a planned route, and the screen says so. Only
 * one waypoint is "being headed to" — the first started order's — because a
 * driver is only ever on the way to one place.
 */
export function fromOrders(orders: OrderRecord[]): JobWaypoint[] {
    const waypoints: JobWaypoint[] = [];
    let heading = false;
    for (const order of inWorkingOrder(orders)) {
        const points = orderPoints(order);
        const cash = cashOnDeliveryOf(order);
        const last = points[points.length - 1];
        points.forEach((p, index) => {
            let state = p.state;
            if (state === 'current') {
                if (heading) state = 'later';
                heading = true;
            }
            waypoints.push({
                key: `${order.id}:${p.id ?? index}`,
                sequence: waypoints.length + 1,
                state,
                role: p.role,
                waypointNumber: p.waypointNumber,
                waypointTotal: p.waypointTotal,
                name: p.name,
                address: p.address,
                point: p.point,
                windowEnd: p.windowEnd,
                orderId: order.id,
                trackingNumber: trackingNumberOf(order),
                itemCount: p.itemCount,
                // Cash changes hands at the end of the order.
                cash: p === last && cash?.toCollect ? cash : undefined,
            });
        });
    }
    return waypoints;
}

export interface RouteCounts {
    total: number;
    done: number;
    left: number;
    orders: number;
    currentIndex: number;
}

export function countWaypoints(waypoints: JobWaypoint[]): RouteCounts {
    const done = waypoints.filter((w) => w.state === 'done' || w.state === 'skipped').length;
    return {
        total: waypoints.length,
        done,
        left: waypoints.length - done,
        orders: new Set(waypoints.map((w) => w.orderId).filter(Boolean)).size,
        currentIndex: waypoints.findIndex((w) => w.state === 'current'),
    };
}
