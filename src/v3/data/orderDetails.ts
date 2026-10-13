/**
 * Readers for the order fields the order-operations contract added.
 *
 * Same reason `accessors` exists: these arrive in more than one shape (a field
 * on the entity, or in its `meta`; a COD amount on the payload, or in the
 * payment summary) and reading them inline is how a shape surprise becomes a
 * blank row on a driver's screen.
 */
import type { OrderRecord } from './orderStore';
import { entityIdOf, payloadOf } from './accessors';

type Rec = Record<string, unknown>;

function recordOf(value: unknown): Rec | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : undefined;
}

function str(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function num(value: unknown): number | undefined {
    const n = typeof value === 'string' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/* -- Items (contract 4: per-entity meta). -------------------------------- */

/** How many of this item. Storefront writes `meta.quantity`; default 1 is the caller's call. */
export function entityQuantityOf(entity?: Rec | null): number | undefined {
    const meta = recordOf(entity?.meta);
    const q = num(meta?.quantity) ?? num(entity?.quantity);
    return q != null && q > 0 ? q : undefined;
}

/** The customer's or store's note on this item ("no ice"). */
export function entityNoteOf(entity?: Rec | null): string | undefined {
    return str(recordOf(entity?.meta)?.note);
}

/** The store marked this item unavailable — the driver should not expect it. */
export function entityUnavailableOf(entity?: Rec | null): boolean {
    return Boolean(recordOf(entity?.meta)?.unavailable);
}

/** The id of the item this one replaces, when it is a substitute. */
export function entitySubstituteForOf(entity?: Rec | null): string | undefined {
    return str(recordOf(entity?.meta)?.substitute_for);
}

/** Finds an entity on the order by any of its identifiers. */
export function findEntity(entities: unknown[], id?: string): Rec | undefined {
    if (!id) return undefined;
    return entities.map(recordOf).find((e): e is Rec => !!e && (entityIdOf(e) === id || e.uuid === id || e.public_id === id || e.internal_id === id));
}

/* -- Cash on delivery. ---------------------------------------------------- */

export type PaymentState = 'paid' | 'to_collect' | 'unpaid' | 'refunded' | 'partially_refunded' | 'balance_due' | string;

export interface CashOnDelivery {
    /** Minor units, like every amount the API returns. */
    amount: number;
    currency?: string;
    /** `meta.payment.state`, when the server sends one. */
    state?: PaymentState;
    /** The driver has money to take at the door. */
    toCollect: boolean;
}

/**
 * What the driver collects, if anything.
 *
 * `payload.cod_amount` is the figure (it is what an edit updates — contract
 * 1.1); `meta.payment` (contract 3) says whether it is still owed. Older
 * orders have no payment summary, and then a non-zero COD amount is itself the
 * statement that cash is due. Settled states owe nothing whatever the amount.
 */
export function cashOnDeliveryOf(order?: Partial<OrderRecord> | null): CashOnDelivery | undefined {
    if (!order) return undefined;
    const payload = recordOf(order.payload);
    const payment = recordOf(recordOf(order.meta)?.payment) ?? recordOf((order as Rec).payment);
    const amount = num(payload?.cod_amount) ?? num(payment?.cod_amount);
    if (!amount || amount <= 0) return undefined;
    const state = str(payment?.state);
    const settled = state === 'paid' || state === 'refunded' || state === 'partially_refunded';
    return {
        amount,
        currency: str(payload?.cod_currency) ?? str(payment?.currency) ?? str((order as Rec).currency),
        state,
        toCollect: !settled,
    };
}

/* -- Instructions, schedule, contact. ------------------------------------ */

/**
 * How to hand it over: the drop-off place's own instructions (where the
 * contract's edit API writes them), else instructions on the payload or order.
 */
export function deliveryInstructionsOf(order?: Partial<OrderRecord> | null): string | undefined {
    const payload = payloadOf(order) as Rec;
    const place = recordOf(payload.dropoff);
    return (
        str(recordOf(place?.meta)?.instructions) ??
        str(place?.instructions) ??
        str(recordOf(payload.meta)?.instructions) ??
        str(recordOf(order?.meta)?.delivery_instructions) ??
        str(recordOf(order?.meta)?.instructions)
    );
}

export interface ServiceBooking {
    start?: string;
    end?: string;
    durationMinutes?: number;
    provider?: string;
}

/** `meta.is_booking` — a service job, not a delivery (contract 6). */
export function isBookingOrder(order?: Partial<OrderRecord> | null): boolean {
    return Boolean(recordOf(order?.meta)?.is_booking);
}

export function bookingOf(order?: Partial<OrderRecord> | null): ServiceBooking | undefined {
    if (!isBookingOrder(order)) return undefined;
    const b = recordOf(recordOf(order?.meta)?.booking) ?? {};
    return { start: str(b.start), end: str(b.end), durationMinutes: num(b.duration_minutes), provider: str(b.provider) };
}

export interface TimeWindow {
    start?: string;
    end?: string;
}

/**
 * When the driver is expected: the booking slot for a job, else the order's
 * scheduled time (with a window end when the order carries one).
 */
export function scheduleWindowOf(order?: Partial<OrderRecord> | null): TimeWindow | undefined {
    const booking = bookingOf(order);
    if (booking?.start) return { start: booking.start, end: booking.end };
    const meta = recordOf(order?.meta);
    const start = str(order?.scheduled_at) ?? str(meta?.scheduled_at);
    if (!start) return undefined;
    const window = recordOf(meta?.delivery_window) ?? recordOf(meta?.time_window);
    return { start: str(window?.start) ?? start, end: str(window?.end) ?? str(meta?.scheduled_end) };
}

export interface ContactPerson {
    name?: string;
    phone?: string;
    email?: string;
}

/** The customer, with the drop-off's phone standing in when theirs is absent. */
export function customerContactOf(order?: Partial<OrderRecord> | null): ContactPerson | undefined {
    const c = recordOf(order?.customer);
    const dropoff = recordOf((payloadOf(order) as Rec).dropoff);
    const contact: ContactPerson = {
        name: str(c?.name) ?? str(dropoff?.name),
        phone: str(c?.phone) ?? str(dropoff?.phone),
        email: str(c?.email),
    };
    return contact.name || contact.phone ? contact : undefined;
}
