/**
 * Normalised order store.
 *
 * Replaces OrderManagerContext, which had two defects that made it unfit to
 * carry a redesign:
 *
 * 1. Its `useMemo` rebuilt **six** SDK collections — `restoreCollection` runs
 *    `new Order(json, adapter)` per row — whenever any of ~12 dependencies
 *    changed. Every list's `data` array and every item prop was therefore
 *    referentially new on each change, defeating `React.memo` and forcing a full
 *    re-render of every card.
 * 2. `const today = format(new Date(), 'yyyy-MM-dd HH:mm:ssXXX')` was computed
 *    at render with **second** precision and used to build an MMKV key, so the
 *    `ordersToday` key changed every second: its subscription was torn down and
 *    rebuilt continuously, it always read `undefined`, and it orphaned a new
 *    MMKV key per second.
 *
 * The fixes here are structural rather than incidental:
 *
 * - Records are stored as **plain JSON keyed by id**. SDK resources are
 *   constructed on demand where a mutation method is needed, not on every read.
 * - Derived views (active, by day) are **cached and invalidated by a version
 *   counter**, so an unchanged view returns the identical array reference.
 * - Day keys are day-precision. There is no clock in a storage key.
 */
import { readJSON, writeJSON } from '../api/storage';
import { isOrderFinished } from './orderStatus';
import { onOrderConfigCached } from './orderConfigCache';

/**
 * The tracking number as the v1 API actually returns it: usually an expanded
 * object, sometimes a bare string. Read it with `trackingNumberOf`, never
 * `String(...)` — the object form stringifies to "[object Object]".
 */
export interface TrackingNumberRef {
    id?: string;
    tracking_number?: string;
    status?: string;
    status_code?: string;
    [key: string]: unknown;
}

/** The subset of the order payload the app actually renders. */
export interface OrderRecord {
    id: string;
    tracking_number?: string | TrackingNumberRef;
    internal_id?: string;
    status?: string;
    adhoc?: boolean;
    driver_assigned?: string | null;
    scheduled_at?: string | null;
    started_at?: string | null;
    dispatched_at?: string | null;
    created_at?: string;
    distance?: number;
    time?: number;
    customer?: { name?: string; phone?: string; email?: string; photo_url?: string } | null;
    /** Bare public id string on the live API; object when expanded. */
    order_config?: string | { id?: string; public_id?: string; [key: string]: unknown };
    pod_required?: boolean;
    payload?: unknown;
    meta?: unknown;
    [key: string]: unknown;
}

export interface OrderStoreState {
    byId: Record<string, OrderRecord>;
    allIds: string[];
    version: number;
}

/**
 * Not yet work in hand. Finished orders are excluded too, but *finished* is the
 * order config's call (its `complete` activity) — see `orderStatus`.
 */
const NOT_STARTED = new Set(['created']);

/** Why an order left the store, for the screens that had it open. */
export type RemovalReason = 'reassigned';

/** A one-line notice for the driver about an order that went away. */
export interface OrderNotice {
    orderId: string;
    reason: RemovalReason;
    /** What the driver knows the order as — the tracking number, usually. */
    label: string;
    at: number;
}

/**
 * Field stamped on a record by a driver-scoped list query, so a later run of
 * the same query can tell which of *its* rows have since gone — an order
 * reached from a manifest stop was never listed and must not be reconciled
 * away. Persisted with the record; stripped from nothing (it is harmless).
 */
export const LISTED_FOR = '_listed_for';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function labelOf(order?: OrderRecord): string {
    const tn = order?.tracking_number as unknown;
    if (typeof tn === 'string' && tn) return tn;
    if (tn && typeof tn === 'object' && typeof (tn as { tracking_number?: unknown }).tracking_number === 'string') {
        return (tn as { tracking_number: string }).tracking_number;
    }
    return String(order?.internal_id ?? order?.id ?? '');
}

/** The assigned driver's id however the API expressed it, or null when unassigned. */
export function assignedDriverIdOf(order?: Partial<OrderRecord> | null): string | null | undefined {
    if (!order || !('driver_assigned' in order)) return undefined;
    const value = order.driver_assigned as unknown;
    if (value == null || value === '') return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
        const v = value as { id?: unknown; public_id?: unknown; uuid?: unknown };
        for (const id of [v.id, v.public_id, v.uuid]) if (typeof id === 'string' && id) return id;
    }
    return undefined;
}

const STORAGE_KEY = 'data.orders';

/** Day precision. The clock does not belong in a cache key. */
export function dayKey(value: string | number | Date = new Date()): string {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return 'invalid';
    // Local day, matching how a driver thinks about "today".
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

export class OrderStore {
    private state: OrderStoreState;
    private listeners = new Set<() => void>();

    /** Derived views, keyed by view name, invalidated by version. */
    private cache = new Map<string, { version: number; value: OrderRecord[] }>();

    /**
     * Orders removed this session, and why. Not persisted: it exists so a
     * screen showing the order can leave and say why, and a cold start has no
     * such screen open. An order that comes back (reassigned to this driver
     * again) is cleared from it by `upsertMany`.
     */
    private removed = new Map<string, RemovalReason>();
    private noticeList: OrderNotice[] = [];

    constructor(initial?: OrderStoreState) {
        this.state =
            initial ??
            readJSON<OrderStoreState>(STORAGE_KEY, { byId: {}, allIds: [], version: 0 });
        /*
         * The "active" view depends on configs (which status finishes an
         * order). A config that arrives after the view was computed must
         * recompute it, or a booking that finished on a custom code stays
         * "active" until something unrelated touches the store.
         */
        onOrderConfigCached(() => this.invalidate());
    }

    subscribe = (fn: () => void): (() => void) => {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    };

    getState = (): OrderStoreState => this.state;

    /** Bulk replace-or-merge. One notify, one persist, regardless of count. */
    upsertMany(orders: OrderRecord[]): void {
        if (!orders.length) return;
        const byId = { ...this.state.byId };
        const allIds = [...this.state.allIds];

        for (const order of orders) {
            if (!order?.id) continue;
            // Back on this driver's list: whatever took it away no longer applies.
            if (this.removed.delete(order.id)) this.noticeList = this.noticeList.filter((n) => n.orderId !== order.id);
            if (!(order.id in byId)) allIds.push(order.id);
            // Merge rather than replace: a list response carries fewer fields
            // than a detail response, and must not erase what detail loaded.
            byId[order.id] = { ...byId[order.id], ...order };
        }

        this.commit({ byId, allIds, version: this.state.version + 1 });
    }

    upsert(order: OrderRecord): void {
        this.upsertMany([order]);
    }

    /**
     * Drops an order. With a reason, the removal is remembered for the session
     * (screens holding the order leave) and a notice is raised for the driver.
     */
    remove(id: string, reason?: RemovalReason): void {
        this.removeMany([id], reason);
    }

    removeMany(ids: string[], reason?: RemovalReason): void {
        const present = ids.filter((id) => id in this.state.byId);
        if (reason) {
            for (const id of ids) {
                this.removed.set(id, reason);
                if (!this.noticeList.some((n) => n.orderId === id)) {
                    this.noticeList = [...this.noticeList, { orderId: id, reason, label: labelOf(this.state.byId[id]), at: Date.now() }];
                }
            }
        }
        if (!present.length) {
            // Nothing stored, but a screen may still hold the id (it was
            // opened from a push before the list loaded) — tell it.
            if (reason) this.notify();
            return;
        }
        const byId = { ...this.state.byId };
        for (const id of present) delete byId[id];
        const gone = new Set(present);
        this.commit({
            byId,
            allIds: this.state.allIds.filter((x) => !gone.has(x)),
            version: this.state.version + 1,
        });
    }

    /**
     * Brings the store in line with a driver-scoped list query.
     *
     * `upsertMany` only ever adds, so an order taken off this driver stayed on
     * their device for good — still listed, still openable, still advanceable
     * into a server refusal. After a query for `driverId`'s orders returns,
     * anything it returned before and has not now is removed — but only where
     * the result can vouch for it: when the page was cut short by `limit`, rows
     * older than the oldest one returned are out of the window, not gone.
     *
     * Returns the ids removed. Active ones are reported as reassigned.
     */
    reconcile(driverId: string, returned: OrderRecord[], { complete }: { complete: boolean }): string[] {
        const keep = new Set(returned.map((o) => o.id));
        const oldest = complete
            ? undefined
            : returned.reduce<string | undefined>((min, o) => {
                  const at = typeof o.created_at === 'string' ? o.created_at : undefined;
                  return at && (!min || at < min) ? at : min;
              }, undefined);

        const stale: string[] = [];
        const reassigned: string[] = [];
        for (const id of this.state.allIds) {
            const row = this.state.byId[id];
            if (!row || keep.has(id)) continue;
            const listedHere = row[LISTED_FOR] === driverId;
            const assigned = assignedDriverIdOf(row);
            // Known to belong to someone else now — gone regardless of window.
            // A uuid cannot be compared with the driver's public id, so it
            // proves nothing either way.
            const movedAway = typeof assigned === 'string' && !UUID.test(assigned) && assigned !== driverId;
            if (!listedHere) continue;
            if (!movedAway && !complete) {
                const at = typeof row.created_at === 'string' ? row.created_at : undefined;
                if (!oldest || !at || at < oldest) continue;
            }
            (isOrderFinished(row) ? stale : reassigned).push(id);
        }
        if (stale.length) this.removeMany(stale);
        if (reassigned.length) this.removeMany(reassigned, 'reassigned');
        return [...stale, ...reassigned];
    }

    clear(): void {
        this.removed.clear();
        this.noticeList = [];
        this.commit({ byId: {}, allIds: [], version: this.state.version + 1 });
    }

    /** Why an order was removed this session, if it was. */
    removalOf(id?: string): RemovalReason | undefined {
        return id ? this.removed.get(id) : undefined;
    }

    /** Notices about orders that went away, oldest first. Identity-stable. */
    notices(): OrderNotice[] {
        return this.noticeList;
    }

    dismissNotice(orderId: string): void {
        if (!this.noticeList.some((n) => n.orderId === orderId)) return;
        this.noticeList = this.noticeList.filter((n) => n.orderId !== orderId);
        this.notify();
    }

    /** Recompute derived views without changing any record. */
    invalidate(): void {
        this.cache.clear();
        this.state = { ...this.state, version: this.state.version + 1 };
        this.notify();
    }

    // ── selectors ────────────────────────────────────────────────────────────
    // Each returns a cached array that keeps its identity until the store
    // actually changes, which is what lets React.memo do its job downstream.

    get(id: string): OrderRecord | undefined {
        return this.state.byId[id];
    }

    all(): OrderRecord[] {
        return this.view('all', (r) => r);
    }

    active(): OrderRecord[] {
        return this.view('active', (rows) => rows.filter((o) => !NOT_STARTED.has(String(o.status)) && !isOrderFinished(o)));
    }

    /** Orders scheduled for, or created on, a given local day. */
    onDay(key: string): OrderRecord[] {
        return this.view(`day:${key}`, (rows) =>
            rows.filter((o) => {
                const when = o.scheduled_at ?? o.created_at;
                return when ? dayKey(when) === key : false;
            })
        );
    }

    /** Ad-hoc offers not yet assigned to anyone. */
    offers(): OrderRecord[] {
        return this.view('offers', (rows) => rows.filter((o) => o.adhoc === true && !o.driver_assigned));
    }

    /**
     * Orders directly offered to this driver and still awaiting an answer
     * (`meta.offer.status === 'offered'`). The offer's own expiry is judged by
     * the caller, which has a clock; the server expires it either way.
     */
    pendingOffers(driverId?: string): OrderRecord[] {
        return this.view(`pending-offers:${driverId ?? ''}`, (rows) => rows.filter((o) => isPendingOfferFor(o, driverId)));
    }

    private view(key: string, project: (rows: OrderRecord[]) => OrderRecord[]): OrderRecord[] {
        const cached = this.cache.get(key);
        if (cached && cached.version === this.state.version) return cached.value;

        const rows = this.state.allIds.map((id) => this.state.byId[id]).filter(Boolean);
        const value = project(rows);
        this.cache.set(key, { version: this.state.version, value });
        return value;
    }

    private commit(next: OrderStoreState) {
        this.state = next;
        this.cache.clear();
        writeJSON(STORAGE_KEY, next);
        this.notify();
    }

    private notify() {
        for (const fn of this.listeners) fn();
    }
}

/** `meta.offer` (Fleet-Ops): a direct offer awaiting this driver's answer. */
export interface OrderOffer {
    driver?: string;
    status?: 'offered' | 'accepted' | 'declined' | 'expired' | string;
    offered_at?: string | null;
    expires_at?: string | null;
    accepted_at?: string | null;
    declined_at?: string | null;
}

export function offerOf(order?: Partial<OrderRecord> | null): OrderOffer | undefined {
    const offer = (order?.meta as { offer?: unknown } | null | undefined)?.offer;
    return offer && typeof offer === 'object' ? (offer as OrderOffer) : undefined;
}

/**
 * Offered to this driver and not yet answered. An offer naming no driver is
 * read as this driver's when the order is assigned to them — a direct
 * assignment starts `offered` (contract 1.4).
 */
export function isPendingOfferFor(order?: Partial<OrderRecord> | null, driverId?: string): boolean {
    const offer = offerOf(order);
    if (!offer || offer.status !== 'offered') return false;
    if (!driverId) return true;
    if (offer.driver) return offer.driver === driverId;
    const assigned = assignedDriverIdOf(order);
    return assigned == null || assigned === driverId;
}

export const orderStore = new OrderStore();
