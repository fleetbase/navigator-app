/**
 * The socket contract with FleetOps.
 *
 * These names come from `Fleetbase\FleetOps\Events\*` and the channels they
 * broadcast on. Getting one wrong is invisible at build time and shows up as a
 * driver who silently never hears about an offer, so they are pinned here.
 */
import { parseRealtimeEvent, affectsOrders } from '../events';

describe('parseRealtimeEvent', () => {
    it('reads a geofence crossing on the driver channel', () => {
        const event = parseRealtimeEvent({
            event: 'GeofenceEntered',
            data: { geofence: { name: 'Harbour depot' }, order_id: 'order_abc' },
        });
        expect(event?.kind).toBe('geofence.entered');
        expect(event?.geofence).toBe('Harbour depot');
        expect(event?.orderId).toBe('order_abc');
    });

    it('accepts the fully qualified class name the broadcaster sends', () => {
        // Laravel broadcasts `App\Events\X` unless broadcastAs() says otherwise.
        expect(parseRealtimeEvent({ event: 'Fleetbase\\FleetOps\\Events\\OrderDispatched' })?.kind).toBe('order.dispatched');
    });

    it('accepts the dotted alias too, since broadcastAs is defined on some and not others', () => {
        expect(parseRealtimeEvent({ event: 'geofence.exited' })?.kind).toBe('geofence.exited');
    });

    it('finds the order id wherever the emitter put it', () => {
        expect(parseRealtimeEvent({ event: 'OrderDispatched', data: { order: { id: 'order_1' } } })?.orderId).toBe('order_1');
        expect(parseRealtimeEvent({ event: 'OrderDispatched', data: { order_id: 'order_2' } })?.orderId).toBe('order_2');
        expect(parseRealtimeEvent({ event: 'OrderDispatched', data: { subject_id: 'order_3' } })?.orderId).toBe('order_3');
    });

    it('ignores an event it has never heard of rather than guessing', () => {
        // A new server capability is not a malformed one; acting on a shape we
        // have not seen is worse than waiting for the next refetch.
        expect(parseRealtimeEvent({ event: 'SomeFutureEvent', data: {} })).toBeUndefined();
    });

    it('is total — junk in, nothing out, never a throw', () => {
        // A socket handler that can throw takes the whole connection with it.
        for (const junk of [null, undefined, 42, 'string', {}, { data: {} }, { event: 123 }]) {
            expect(() => parseRealtimeEvent(junk)).not.toThrow();
            expect(parseRealtimeEvent(junk)).toBeUndefined();
        }
    });

    it('recognises an ad-hoc offer by the name actually on the wire', () => {
        // OrderPing::broadcastType() is 'order.ping'. There is no OrderOffered.
        expect(parseRealtimeEvent({ event: 'order.ping', data: { order_id: 'order_9' } })?.kind).toBe('order.offered');
        expect(parseRealtimeEvent({ event: 'OrderPing', data: { order_id: 'order_9' } })?.kind).toBe('order.offered');
    });
});

describe('affectsOrders', () => {
    it('is true for anything about an order, so the app refetches', () => {
        expect(affectsOrders('order.dispatched')).toBe(true);
        expect(affectsOrders('order.offered')).toBe(true);
    });

    it('is false for a geofence crossing, which changes no order data', () => {
        expect(affectsOrders('geofence.entered')).toBe(false);
    });
});
