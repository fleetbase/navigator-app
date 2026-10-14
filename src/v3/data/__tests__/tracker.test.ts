import { chooseEta, currentStop, type TrackerRecord } from '../useTracker';

/** Shaped from a live `GET /v1/orders/{id}/tracker`. */
const dispatched: TrackerRecord = {
    lifecycle: { status: 'dispatched', has_started: false, show_live_eta: false, show_start_eta: true },
    eta: { active_stop_seconds: null, completion_seconds: null, start_seconds: 1956, start_at: '2026-08-22T05:03:56.805032Z' },
    insights: { is_delayed: false, is_location_stale: true, is_off_route: false },
    active_stop: { uuid: 'a', type: 'pickup', completed: false, address: '18 Loyang Crescent', sequence: 1 },
    next_stop: { uuid: 'b', type: 'dropoff', completed: false, address: '100 Beach Road', sequence: 2 },
};

const enroute: TrackerRecord = {
    lifecycle: { status: 'enroute', has_started: true, show_live_eta: true, show_start_eta: false },
    eta: { active_stop_seconds: 420, active_stop_at: '2026-08-22T05:10:00Z', start_seconds: 999 },
    insights: { is_delayed: true, delay_seconds: 300, is_location_stale: false },
};

describe('chooseEta', () => {
    it('shows an estimated start, not an arrival, before the job begins', () => {
        // The server says show_start_eta; inventing an arrival time for a job
        // nobody has begun would be a confident lie.
        const eta = chooseEta(dispatched);
        expect(eta.kind).toBe('start');
        expect(eta.seconds).toBe(1956);
    });

    it('shows the live arrival once the job has started', () => {
        const eta = chooseEta(enroute);
        expect(eta.kind).toBe('live');
        expect(eta.seconds).toBe(420);
    });

    it('defers to the server rather than picking from whatever is populated', () => {
        // start_seconds is present but the server did not authorise showing it.
        const eta = chooseEta({ lifecycle: { show_live_eta: false, show_start_eta: false }, eta: { start_seconds: 999 } });
        expect(eta.kind).toBe('none');
    });

    it('reports no ETA rather than a zero when there is nothing to show', () => {
        expect(chooseEta({}).kind).toBe('none');
        expect(chooseEta(null).kind).toBe('none');
        expect(chooseEta(undefined).seconds).toBeUndefined();
    });

    it('carries the staleness flag, so the number can be labelled', () => {
        // The live instance answered with a position ~12 hours old.
        expect(chooseEta(dispatched).stale).toBe(true);
        expect(chooseEta(enroute).stale).toBe(false);
    });
});

describe('currentStop', () => {
    it('prefers the active stop over the next one', () => {
        expect(currentStop(dispatched)?.uuid).toBe('a');
    });

    it('falls back to next_stop when nothing is active', () => {
        expect(currentStop({ next_stop: { uuid: 'b' } })?.uuid).toBe('b');
    });

    it('falls back again to the first incomplete stop', () => {
        expect(
            currentStop({ stops: [{ uuid: 'x', completed: true }, { uuid: 'y', completed: false }] })?.uuid
        ).toBe('y');
    });

    it('is undefined when every stop is done', () => {
        expect(currentStop({ stops: [{ uuid: 'x', completed: true }] })).toBeUndefined();
        expect(currentStop(null)).toBeUndefined();
    });
});
