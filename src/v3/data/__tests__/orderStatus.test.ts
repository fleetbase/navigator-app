/**
 * "Finished" is the order config's call. A booking flow can end on a code no
 * hard-coded list knows; the activity it ends on carries `complete: true`.
 */
import { isFinishedStatus, isOrderFinished } from '../orderStatus';
import { cacheOrderConfig, clearOrderConfigCache } from '../orderConfigCache';
import { OrderStore } from '../orderStore';
import { clearV3 } from '../../api/storage';

beforeEach(() => {
    clearV3();
    clearOrderConfigCache();
});

const BOOKING_FLOW = [
    { code: 'booked' },
    { code: 'confirmed' },
    { code: 'provider_enroute' },
    { code: 'in_progress' },
    { code: 'job_done', complete: true },
];

describe('isFinishedStatus', () => {
    it('reads the flow\'s complete flag', () => {
        expect(isFinishedStatus('job_done', BOOKING_FLOW)).toBe(true);
        expect(isFinishedStatus('in_progress', BOOKING_FLOW)).toBe(false);
    });

    it('falls back to the old names without a flow, or for a code the flow does not name', () => {
        expect(isFinishedStatus('completed')).toBe(true);
        expect(isFinishedStatus('order_completed')).toBe(true);
        expect(isFinishedStatus('job_done')).toBe(false);
        expect(isFinishedStatus('completed', BOOKING_FLOW)).toBe(true);
    });

    it('treats abandonment as terminal whatever the config says', () => {
        expect(isFinishedStatus('canceled', BOOKING_FLOW)).toBe(true);
        expect(isFinishedStatus('expired', BOOKING_FLOW)).toBe(true);
    });
});

describe('isOrderFinished / the store\'s active view', () => {
    it('uses the cached config for the order', () => {
        const order = { id: 'o', status: 'job_done', order_config: 'cfg_booking' };
        expect(isOrderFinished(order)).toBe(false);
        cacheOrderConfig('cfg_booking', { id: 'cfg_booking', flow: BOOKING_FLOW });
        expect(isOrderFinished(order)).toBe(true);
    });

    it('recomputes "active" when the config arrives after the view was built', () => {
        const s = new OrderStore({ byId: {}, allIds: [], version: 0 });
        s.upsert({ id: 'o', status: 'job_done', order_config: 'cfg_booking' });
        expect(s.active().map((o) => o.id)).toEqual(['o']);
        const notified = jest.fn();
        s.subscribe(notified);
        cacheOrderConfig('cfg_booking', { id: 'cfg_booking', flow: BOOKING_FLOW });
        expect(notified).toHaveBeenCalled();
        expect(s.active()).toEqual([]);
    });
});
