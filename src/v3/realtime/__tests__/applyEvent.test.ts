import { applyRealtimeEvent } from '../applyEvent';
import { orderChangeOf, resetOrderChanges } from '../orderChanges';
import { liveRefreshRevision, resetLiveRefresh } from '../liveRefresh';
import { parseRealtimeEvent } from '../events';
import { orderStore } from '../../data/orderStore';
import { clearV3 } from '../../api/storage';

beforeEach(() => {
    clearV3();
    orderStore.clear();
    resetOrderChanges();
    resetLiveRefresh();
});

const apply = (raw: unknown) => applyRealtimeEvent(parseRealtimeEvent(raw)!);

describe('applyRealtimeEvent', () => {
    it('removes an order taken off this driver and raises a notice', () => {
        orderStore.upsert({ id: 'order_1', status: 'driver_enroute', tracking_number: 'FLE1' });
        apply({ event: 'order.driver_unassigned', data: { id: 'order_1' } });
        expect(orderStore.get('order_1')).toBeUndefined();
        expect(orderStore.removalOf('order_1')).toBe('reassigned');
        expect(orderStore.notices()).toEqual([expect.objectContaining({ orderId: 'order_1', label: 'FLE1' })]);
    });

    it('holds the change summary for the order and asks lists to refetch', () => {
        const before = liveRefreshRevision();
        apply({ event: 'order.changed', data: { id: 'order_2', changes: ['dropoff'], summary: 'Drop-off changed', changed_by: 'Jon (store)' } });
        expect(orderChangeOf('order_2')).toMatchObject({ summary: 'Drop-off changed', changes: ['dropoff'], changedBy: 'Jon (store)' });
        expect(liveRefreshRevision()).toBeGreaterThan(before);
    });

    it('accumulates changes so an earlier drop-off move is not forgotten', () => {
        apply({ event: 'order.changed', data: { id: 'order_3', changes: ['dropoff'], summary: 'first' } });
        apply({ event: 'order.changed', data: { id: 'order_3', changes: ['notes'], summary: 'second' } });
        expect(orderChangeOf('order_3')).toMatchObject({ summary: 'second', changes: ['dropoff', 'notes'] });
    });

    it('brings a reassigned order back if it is assigned to this driver again', () => {
        orderStore.upsert({ id: 'order_4', status: 'dispatched' });
        apply({ event: 'order.driver_unassigned', data: { id: 'order_4' } });
        orderStore.upsert({ id: 'order_4', status: 'dispatched' });
        expect(orderStore.removalOf('order_4')).toBeUndefined();
    });
});
