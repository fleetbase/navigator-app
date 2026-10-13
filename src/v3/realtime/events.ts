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
    | 'order.offered'
    /** Something about the order was edited — address, items, schedule, notes, totals. */
    | 'order.changed'
    /** Generic resource lifecycle update; carries no summary, just "reload". */
    | 'order.updated'
    /** This driver was taken off the order (unassigned or reassigned). */
    | 'order.unassigned'
    /** A direct offer to this driver lapsed without an answer. */
    | 'order.offer_expired'
    /** A chat message (or log line) landed in a channel the driver is in. */
    | 'chat.message';

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
    /** `order.changed`: which parts moved — `dropoff`, `items`, `schedule`, … */
    changes?: string[];
    /** `order.changed`: one line a driver can read, e.g. "Drop-off changed to …". */
    summary?: string;
    /** Chat events: the channel's public id. */
    channelId?: string;
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
    /*
     * Ad-hoc offers. `DispatchAdhocOrders` runs every minute, finds drivers
     * within the order's ping distance, and notifies each with `OrderPing`,
     * whose `broadcastType()` is `order.ping`. That is the name on the wire —
     * there is no OrderOffered event, whatever its absence in this map once
     * implied.
     */
    'order.ping': 'order.offered',
    OrderPing: 'order.offered',
    /*
     * The `OrderAssigned` *notification* broadcasts under its own name, not as
     * the event above — a directly assigned order reaches the driver as this.
     */
    'order.assigned_notification': 'order.assigned',
    OrderAssigned: 'order.assigned',
    // Order operations contract (1.1–1.4).
    'order.changed': 'order.changed',
    OrderChanged: 'order.changed',
    'order.updated': 'order.updated',
    'order.driver_unassigned': 'order.unassigned',
    OrderDriverUnassigned: 'order.unassigned',
    'order.offer_expired': 'order.offer_expired',
    OrderOfferExpired: 'order.offer_expired',
    /*
     * Chat. core-api's resource lifecycle events broadcast `chat_message.created`
     * on `chat.{id}`; the ChatMessageReceived notification broadcasts
     * `chat_participent.chat_message_received` (sic) on `chat_channel.{id}`.
     */
    'chat_message.created': 'chat.message',
    'chat_log.created': 'chat.message',
    'chat_participent.chat_message_received': 'chat.message',
    'chat_participant.chat_message_received': 'chat.message',
    ChatMessageReceived: 'chat.message',
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
    if (!kind) {
        /*
         * Still dropped — but said out loud in development, because an event
         * name that drifts on the server is otherwise invisible until a driver
         * notices they stopped hearing about something.
         */
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.debug(`[realtime] ignoring unknown event "${name}"`);
        }
        return undefined;
    }

    const data = ((event.data && typeof event.data === 'object' ? event.data : event) ?? {}) as Record<string, unknown>;
    const order = data.order as Record<string, unknown> | undefined;
    const message = data.message as Record<string, unknown> | undefined;

    /*
     * The order operations events (`order.changed`, `order.driver_unassigned`,
     * `order.offer_expired`) and the resource lifecycle `order.updated` carry
     * the order's own id as `data.id`. Only trusted when it looks like one —
     * a chat message's `id` is the message's.
     */
    const ownId = readString(data, 'id');
    const orderId =
        readString(data, 'order_id', 'orderId', 'subject_id') ??
        readString(order, 'id', 'public_id') ??
        (kind.startsWith('order.') && ownId && /^order_/.test(ownId) ? ownId : undefined);

    const changes = Array.isArray(data.changes) ? (data.changes as unknown[]).filter((c): c is string => typeof c === 'string') : undefined;

    return {
        kind,
        orderId,
        geofence: readString(data, 'geofence', 'geofence_name') ?? readString(data.geofence as object, 'name'),
        changes,
        summary: readString(data, 'summary'),
        channelId: kind === 'chat.message' ? (readString(data, 'chat_channel', 'channel', 'chat_channel_uuid') ?? readString(message, 'channel')) : undefined,
        raw: event,
    };
}

/** Events that mean an order the driver holds has changed and should refetch. */
export function affectsOrders(kind: RealtimeEventKind): boolean {
    return kind.startsWith('order.');
}

/** The order's changes include a new drop-off — navigation must be re-opened. */
export function changesDropoff(changes?: string[] | null): boolean {
    return Array.isArray(changes) && changes.some((c) => c === 'dropoff' || c === 'destination' || c === 'address');
}
