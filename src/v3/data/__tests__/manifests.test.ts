import { ManifestStore, sortStops } from '../manifestStore';
import { bucketOf, groupManifests, scheduledDayOf, manifestProgress, currentManifestStop } from '../useManifests';
import { clearV3 } from '../../api/storage';

const fresh = () => new ManifestStore({ byId: {}, allIds: [], version: 0 });

beforeEach(() => clearV3());

describe('scheduledDayOf', () => {
    it('takes the day from the string, not from a UTC-midnight Date', () => {
        // Read through `Date` in a negative-offset zone this is the 18th.
        expect(scheduledDayOf({ scheduled_date: '2026-08-19T00:00:00.000000Z' })).toBe('2026-08-19');
        expect(scheduledDayOf({ scheduled_date: '2026-08-19' })).toBe('2026-08-19');
        expect(scheduledDayOf({ scheduled_date: null })).toBeUndefined();
    });
});

describe('bucketOf / groupManifests — R2 B1', () => {
    const today = '2026-08-19';

    it('splits today, upcoming and past by scheduled day', () => {
        expect(bucketOf({ id: 'a', scheduled_date: '2026-08-19' }, today)).toBe('today');
        expect(bucketOf({ id: 'b', scheduled_date: '2026-08-20' }, today)).toBe('upcoming');
        expect(bucketOf({ id: 'c', scheduled_date: '2026-08-18' }, today)).toBe('past');
    });

    it("keeps yesterday's unfinished route in today — it is the one the driver is on", () => {
        expect(bucketOf({ id: 'd', scheduled_date: '2026-08-18', status: 'in_progress' }, today)).toBe('today');
    });

    it('orders today and upcoming forwards, past backwards', () => {
        const g = groupManifests(
            [
                { id: 'p1', scheduled_date: '2026-08-10' },
                { id: 'u2', scheduled_date: '2026-08-22' },
                { id: 'p2', scheduled_date: '2026-08-15' },
                { id: 'u1', scheduled_date: '2026-08-20' },
                { id: 't', scheduled_date: '2026-08-19' },
            ],
            today
        );
        expect(g.today.map((m) => m.id)).toEqual(['t']);
        expect(g.upcoming.map((m) => m.id)).toEqual(['u1', 'u2']);
        expect(g.past.map((m) => m.id)).toEqual(['p2', 'p1']);
    });
});

describe('manifestProgress', () => {
    it('counts from the stops when they are loaded, so a queued update shows', () => {
        const p = manifestProgress({
            id: 'm',
            stop_count: 9,
            completed_stops: 1,
            stops: [
                { id: 'a', status: 'completed', sequence: 1 },
                { id: 'b', status: 'skipped', sequence: 2 },
                { id: 'c', status: 'arrived', sequence: 3 },
                { id: 'd', status: 'pending', sequence: 4 },
            ],
        });
        expect(p).toEqual({ total: 4, completed: 2, pending: 2, currentIndex: 2 });
    });

    it('falls back to the manifest counters for a list row', () => {
        expect(manifestProgress({ id: 'm', stop_count: 7, completed_stops: 2 })).toEqual({ total: 7, completed: 2, pending: 5 });
        expect(manifestProgress(undefined)).toEqual({ total: 0, completed: 0, pending: 0 });
    });

    it('treats an arrived stop as current ahead of the first pending one', () => {
        const stops = [
            { id: 'a', status: 'pending', sequence: 1 },
            { id: 'b', status: 'arrived', sequence: 2 },
        ];
        expect(currentManifestStop(stops)?.id).toBe('b');
        expect(currentManifestStop([{ id: 'a', status: 'completed' }])).toBeUndefined();
    });
});

describe('ManifestStore', () => {
    it('keeps stops loaded by a detail read when a list row arrives without them', () => {
        const store = fresh();
        store.upsert({ id: 'm', status: 'active', stops: [{ id: 's2', sequence: 2 }, { id: 's1', sequence: 1 }] });
        store.upsertMany([{ id: 'm', status: 'in_progress' }]);
        expect(store.get('m')?.status).toBe('in_progress');
        // ...and in driving order, whatever order they arrived in.
        expect(store.stopsOf('m').map((s) => s.id)).toEqual(['s1', 's2']);
    });

    it('patches one stop in place and notifies', () => {
        const store = fresh();
        const seen = jest.fn();
        store.subscribe(seen);
        store.upsert({ id: 'm', stops: [{ id: 's1', sequence: 1, status: 'pending' }] });
        store.updateStop('m', 's1', { status: 'arrived' });
        expect(store.stop('m', 's1')?.status).toBe('arrived');
        expect(seen).toHaveBeenCalledTimes(2);
    });

    it('returns an identity-stable list until something changes', () => {
        const store = fresh();
        store.upsert({ id: 'a', scheduled_date: '2026-08-19' });
        const first = store.all();
        expect(store.all()).toBe(first);
        store.upsert({ id: 'b', scheduled_date: '2026-08-20' });
        expect(store.all()).not.toBe(first);
        expect(store.all().map((m) => m.id)).toEqual(['b', 'a']);
    });

    it('sorts stops by sequence', () => {
        expect(sortStops([{ id: 'c', sequence: 3 }, { id: 'a', sequence: 1 }]).map((s) => s.id)).toEqual(['a', 'c']);
    });
});
