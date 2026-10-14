/**
 * Where an order's driver is going, and in what order.
 *
 * Orders come in three shapes, and the destination is resolved the same way in
 * all of them:
 *
 *   1. **pickup + dropoff** — collect, then deliver. `current_waypoint`
 *      normally names the pickup and then the drop-off, and a driver who has
 *      already collected can move it on themselves.
 *   2. **pickup + waypoints + dropoff** — the waypoints sit between the two.
 *   3. **waypoints only** — no distinguished ends.
 *
 * `payload.current_waypoint` is a **place id**, and it is what the server
 * writes when `set-destination` is called: `setPayloadCurrentServiceStop`
 * stores `current_waypoint_uuid` on the payload. So it is the authoritative
 * answer to "where now", not something to be inferred.
 *
 * This mirrors v2 (`src/screens/OrderScreen.tsx`), deliberately: the ordering
 * `[pickup, ...waypoints, dropoff]` and the fall back to the first stop when
 * nothing matches are the behaviour drivers already know.
 */

export interface OrderStop {
    /** Place id — what `current_waypoint` holds and `set-destination` takes. */
    id?: string;
    name?: string;
    address?: string;
    type: 'pickup' | 'dropoff' | 'waypoint';
    location?: { type?: string; coordinates?: number[] } | null;
}

interface PlaceLike {
    id?: string;
    name?: string;
    address?: string;
    location?: { type?: string; coordinates?: number[] } | null;
}

export interface StopsPayload {
    pickup?: PlaceLike | null;
    dropoff?: PlaceLike | null;
    waypoints?: PlaceLike[] | null;
    current_waypoint?: string | null;
}

/**
 * Every stop on the order, in the order a driver works through them.
 *
 * A waypoints-only order has no pickup or drop-off to bracket it, and a simple
 * order has no waypoints — filtering absent ends rather than special-casing
 * each shape is what keeps all three working from one list.
 */
export function orderStops(payload?: StopsPayload | null): OrderStop[] {
    if (!payload) return [];
    const stops: OrderStop[] = [];
    const push = (place: PlaceLike | null | undefined, type: OrderStop['type']) => {
        if (!place) return;
        stops.push({ id: place.id, name: place.name, address: place.address, location: place.location, type });
    };

    push(payload.pickup, 'pickup');
    for (const waypoint of payload.waypoints ?? []) push(waypoint, 'waypoint');
    push(payload.dropoff, 'dropoff');
    return stops;
}

/**
 * The stop the driver is heading to.
 *
 * Falls back to the first stop when `current_waypoint` names nothing in the
 * list — a freshly created order has not been moved on yet, and the first stop
 * is where it starts.
 */
export function currentDestination(payload?: StopsPayload | null): OrderStop | undefined {
    const stops = orderStops(payload);
    if (!stops.length) return undefined;
    const current = payload?.current_waypoint;
    return stops.find((stop) => !!stop.id && stop.id === current) ?? stops[0];
}

/** A label for a stop, preferring its name over its address. */
export function stopLabel(stop?: OrderStop | null): string | undefined {
    return stop?.name ?? stop?.address ?? undefined;
}
