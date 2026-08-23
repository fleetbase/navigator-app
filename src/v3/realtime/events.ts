/**
 * The realtime events a driver's app cares about, and what they mean.
 *
 * FleetOps broadcasts on SocketCluster channels named after the subject:
 * `driver.{public_id}` and `driver.{uuid}`, `order.{id}`, `vehicle.{id}`,
 * `chat.{id}`, `company.{uuid}`. Everything a driver needs arrives on their own
 * driver channel — geofence crossings, order assignment and dispatch, ad-hoc
 * offers — which is why the shell subscribes to exactly one.
 *
 * The event names are the server's own (`Fleetbase\FleetOps\Events\*`), so this
 * map is a contract with the backend rather than a convenience. Anything not
 * listed is ignored rather than guessed at: an unrecognised event is a new
 * server capability, not a malformed one, and dropping it quietly is better
 * than acting on a shape we have not seen.
 */

export type RealtimeEventKind =
    | 'geofence.entered'
    | 'geofence.exited'
    | 'geofence.dwelled'
    | 'order.assigned'
    | 'order.dispatched'
    | 'order.ready'
    | 'order.started'
    | 'order.completed'
    | 'order.canceled'
    | 'order.failed'
    | 'order.offered';

/** Raw shape SocketCluster delivers: `{ event, data }` in FleetOps' emitters. */
export interface RawSocketEvent {
    event?: string;
    data?: unknown;
    [key: string]: unknown;
}

export interface RealtimeEvent {
    kind: RealtimeEventKind;
    /** Public id of the order the event concerns, when it concerns one. */
    orderId?: string;
    /** Geofence name, for the crossing events. */
    geofence?: string;
    raw: RawSocketEvent;
}

/**
 * FleetOps event class names, mapped to what the app does about them.
 *
 * Both the bare class name and the dotted broadcast alias are accepted, because
 * `broadcastAs()` is defined on some events and not others.
 */
const KINDS: Record<string, RealtimeEventKind> = {
    GeofenceEntered: 'geofence.entered',
    'geofence.entered': 'geofence.entered',
    GeofenceExited: 'geofence.exited',
    'geofence.exited': 'geofence.exited',
    GeofenceDwelled: 'geofence.dwelled',
    'geofence.dwelled': 'geofence.dwelled',
    OrderDriverAssigned: 'order.assigned',
    'order.driver_assigned': 'order.assigned',
    OrderDispatched: 'order.dispatched',
    'order.dispatched': 'order.dispatched',
    OrderReady: 'order.ready',
    OrderStarted: 'order.started',
    OrderCompleted: 'order.completed',
    OrderCanceled: 'order.canceled',
    OrderFailed: 'order.failed',
    /* Ad-hoc offers ride in on assignment of an order flagged `adhoc`. */
    OrderOffered: 'order.offered',
    'order.offered': 'order.offered',
};

function readString(source: unknown, ...keys: string[]): string | undefined {
    if (!source || typeof source !== 'object') return undefined;
    for (const key of keys) {
        const value = (source as Record<string, unknown>)[key];
        if (typeof value === 'string' && value) return value;
    }
    return undefined;
}

/**
 * Turns a socket payload into an event the app understands, or `undefined`.
 *
 * Deliberately total: a malformed or unknown payload yields nothing rather than
 * throwing, because a socket handler that can throw takes the connection down
 * with it.
 */
export function parseRealtimeEvent(raw: unknown): RealtimeEvent | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const event = raw as RawSocketEvent;

    const name = typeof event.event === 'string' ? event.event : undefined;
    if (!name) return undefined;

    // `App\Events\OrderDispatched` and `OrderDispatched` are the same thing.
    const shortName = name.includes('\\') ? name.slice(name.lastIndexOf('\\') + 1) : name;
    const kind = KINDS[shortName] ?? KINDS[name];
    if (!kind) return undefined;

    const data = (event.data ?? event) as Record<string, unknown>;
    const order = data.order as Record<string, unknown> | undefined;

    return {
        kind,
        orderId: readString(data, 'order_id', 'orderId', 'subject_id') ?? readString(order, 'id', 'public_id'),
        geofence: readString(data, 'geofence', 'geofence_name') ?? readString(data.geofence as object, 'name'),
        raw: event,
    };
}

/** Events that mean an order the driver holds has changed and should refetch. */
export function affectsOrders(kind: RealtimeEventKind): boolean {
    return kind.startsWith('order.');
}
