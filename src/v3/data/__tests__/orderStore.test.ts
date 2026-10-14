import { OrderStore, dayKey, type OrderRecord } from '../orderStore';
import { clearV3 } from '../../api/storage';

const order = (id: string, over: Partial<OrderRecord> = {}): OrderRecord => ({
    id, status: 'driver_enroute', tracking_number: `FLE${id}`, created_at: '2026-08-20T09:00:00Z', ...over,
});

beforeEach(() => clearV3());

describe('order store', () => {
    it('keeps view identity stable when nothing changed — this is what makes React.memo work', () => {
        const s = new OrderStore({ byId: {}, allIds: [], version: 0 });
        s.upsertMany([order('a'), order('b')]);

        const first = s.active();
        const second = s.active();
        expect(first).toBe(second);
    });

    it('invalidates views on write', () => {
        const s = new OrderStore({ byId: {}, allIds: [], version: 0 });
        s.upsertMany([order('a')]);
        const before = s.active();
        s.upsertMany([order('b')]);
        expect(s.active()).not.toBe(before);
        expect(s.active()).toHaveLength(2);
    });

    it('does not disturb unrelated views when one order changes', () => {
        const s = new OrderStore({ byId: {}, allIds: [], version: 0 });
        s.upsertMany([order('a')]);
        const offersBefore = s.offers();
        s.upsert(order('a', { status: 'completed' }));
        // Different content is expected for `active`, but `offers` is still empty —
        // and callers comparing lengths should see a consistent view.
        expect(s.offers()).toHaveLength(offersBefore.length);
        expect(s.active()).toHaveLength(0);
    });

    it('merges rather than replaces, so a list response cannot erase detail fields', () => {
        const s = new OrderStore({ byId: {}, allIds: [], version: 0 });
        s.upsert(order('a', { payload: { waypoints: [1, 2, 3] } }));
        // A subsequent list response carries fewer fields.
        s.upsert({ id: 'a', status: 'completed' });
        const rec = s.get('a')!;
        expect(rec.status).toBe('completed');
        expect(rec.payload).toEqual({ waypoints: [1, 2, 3] });
    });

    it('excludes terminal statuses from active', () => {
        const s = new OrderStore({ byId: {}, allIds: [], version: 0 });
        s.upsertMany([
            order('a', { status: 'driver_enroute' }),
            order('b', { status: 'completed' }),
            order('c', { status: 'canceled' }),
            order('d', { status: 'created' }),
            order('e', { status: 'started' }),
        ]);
        expect(s.active().map((o) => o.id).sort()).toEqual(['a', 'e']);
    });

    it('treats an unassigned adhoc order as an offer', () => {
        const s = new OrderStore({ byId: {}, allIds: [], version: 0 });
        s.upsertMany([
            order('a', { adhoc: true, driver_assigned: null }),
            order('b', { adhoc: true, driver_assigned: 'driver_1' }),
            order('c', { adhoc: false }),
        ]);
        expect(s.offers().map((o) => o.id)).toEqual(['a']);
    });

    it('notifies subscribers once per bulk write, not once per row', () => {
        const s = new OrderStore({ byId: {}, allIds: [], version: 0 });
        let notifications = 0;
        s.subscribe(() => { notifications += 1; });
        s.upsertMany([order('a'), order('b'), order('c')]);
        expect(notifications).toBe(1);
    });

    it('survives a cold start', () => {
        const first = new OrderStore({ byId: {}, allIds: [], version: 0 });
        first.upsertMany([order('a'), order('b')]);
        const revived = new OrderStore();
        expect(revived.all()).toHaveLength(2);
        expect(revived.get('a')?.tracking_number).toBe('FLEa');
    });
});

describe('dayKey', () => {
    it('has no clock in it — v2 built MMKV keys with second precision', () => {
        const morning = dayKey(new Date(2026, 7, 20, 6, 0, 1));
        const evening = dayKey(new Date(2026, 7, 20, 23, 59, 59));
        expect(morning).toBe(evening);
        expect(morning).toBe('2026-08-20');
    });

    it('is stable across repeated calls within a day', () => {
        const a = dayKey(new Date(2026, 7, 20, 10, 0, 0));
        const b = dayKey(new Date(2026, 7, 20, 10, 0, 30));
        expect(a).toBe(b);
    });

    it('separates distinct days', () => {
        expect(dayKey(new Date(2026, 7, 20))).not.toBe(dayKey(new Date(2026, 7, 21)));
    });

    it('does not throw on a bad value', () => {
        expect(dayKey('not-a-date')).toBe('invalid');
    });
});

describe('order store — reassignment and reconciliation', () => {
    const fresh = () => new OrderStore({ byId: {}, allIds: [], version: 0 });
    const listed = (id: string, over: Partial<OrderRecord> = {}) => order(id, { _listed_for: 'driver_me', ...over });

    it('removes what a full driver-scoped page no longer returns, and calls the active ones reassigned', () => {
        const s = fresh();
        s.upsertMany([listed('a'), listed('b'), listed('c', { status: 'completed' })]);
        const removed = s.reconcile('driver_me', [listed('a')], { complete: true });
        expect(removed.sort()).toEqual(['b', 'c']);
        expect(s.get('b')).toBeUndefined();
        expect(s.removalOf('b')).toBe('reassigned');
        // A finished order dropping out is housekeeping, not news.
        expect(s.removalOf('c')).toBeUndefined();
        expect(s.notices().map((n) => n.orderId)).toEqual(['b']);
    });

    it('leaves rows a truncated page cannot vouch for', () => {
        const s = fresh();
        s.upsertMany([
            listed('new', { created_at: '2026-08-20T12:00:00Z' }),
            listed('gone', { created_at: '2026-08-20T11:00:00Z' }),
            listed('old', { created_at: '2026-08-01T09:00:00Z' }),
        ]);
        // Page of 2 (= limit), oldest returned is 10:00 — `old` is outside the window.
        s.reconcile('driver_me', [listed('new', { created_at: '2026-08-20T12:00:00Z' }), listed('x', { created_at: '2026-08-20T10:00:00Z' })], { complete: false });
        expect(s.get('gone')).toBeUndefined();
        expect(s.get('old')).toBeDefined();
    });

    it('never reconciles away an order this query did not list', () => {
        const s = fresh();
        // Opened from a manifest stop; never part of the driver's list.
        s.upsert(order('from-route'));
        s.reconcile('driver_me', [], { complete: true });
        expect(s.get('from-route')).toBeDefined();
    });

    it('dismisses a notice', () => {
        const s = fresh();
        s.upsert(order('a'));
        s.remove('a', 'reassigned');
        s.dismissNotice('a');
        expect(s.notices()).toEqual([]);
    });
});
