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

/** Statuses that are not "work in hand". Mirrors v2's set. */
const INACTIVE = new Set(['completed', 'created', 'canceled', 'order_canceled', 'failed']);

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

    constructor(initial?: OrderStoreState) {
        this.state =
            initial ??
            readJSON<OrderStoreState>(STORAGE_KEY, { byId: {}, allIds: [], version: 0 });
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

    remove(id: string): void {
        if (!(id in this.state.byId)) return;
        const byId = { ...this.state.byId };
        delete byId[id];
        this.commit({
            byId,
            allIds: this.state.allIds.filter((x) => x !== id),
            version: this.state.version + 1,
        });
    }

    clear(): void {
        this.commit({ byId: {}, allIds: [], version: this.state.version + 1 });
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
        return this.view('active', (rows) => rows.filter((o) => !INACTIVE.has(String(o.status))));
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
        for (const fn of this.listeners) fn();
    }
}

export const orderStore = new OrderStore();
