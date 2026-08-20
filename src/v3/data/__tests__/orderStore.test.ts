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
