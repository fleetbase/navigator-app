/**
 * The socket contract with FleetOps.
 *
 * These names come from `Fleetbase\FleetOps\Events\*` and the channels they
 * broadcast on. Getting one wrong is invisible at build time and shows up as a
 * driver who silently never hears about an offer, so they are pinned here.
 */
import { parseRealtimeEvent, affectsOrders, changesDropoff } from '../events';

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

describe('order operations events (contract 1.1–1.4)', () => {
    it('reads order.changed with its summary and change list, the order id coming from data.id', () => {
        const event = parseRealtimeEvent({
            event: 'order.changed',
            data: { id: 'order_42', changes: ['dropoff', 'items'], summary: 'Drop-off changed to 8 Marina View', changed_by: 'Jon (store)' },
        });
        expect(event?.kind).toBe('order.changed');
        expect(event?.orderId).toBe('order_42');
        expect(event?.changes).toEqual(['dropoff', 'items']);
        expect(event?.summary).toBe('Drop-off changed to 8 Marina View');
    });

    it('maps reassignment, offer expiry and the lifecycle update', () => {
        expect(parseRealtimeEvent({ event: 'order.driver_unassigned', data: { id: 'order_1' } })).toMatchObject({ kind: 'order.unassigned', orderId: 'order_1' });
        expect(parseRealtimeEvent({ event: 'order.offer_expired', data: { id: 'order_2' } })).toMatchObject({ kind: 'order.offer_expired', orderId: 'order_2' });
        expect(parseRealtimeEvent({ event: 'order.updated', data: { id: 'order_3' } })).toMatchObject({ kind: 'order.updated', orderId: 'order_3' });
    });

    it('recognises the assignment notification by its broadcast name', () => {
        // OrderAssigned::toArray() sends `order.assigned_notification`, not the event class.
        expect(parseRealtimeEvent({ event: 'order.assigned_notification', data: { id: 'order_9', type: 'order_assigned' } })).toMatchObject({
            kind: 'order.assigned',
            orderId: 'order_9',
        });
    });

    it('does not mistake a non-order id for an order', () => {
        expect(parseRealtimeEvent({ event: 'order.updated', data: { id: 'place_1' } })?.orderId).toBeUndefined();
    });

    it('reads chat messages from either broadcast and keeps the channel id', () => {
        expect(parseRealtimeEvent({ event: 'chat_message.created', data: { id: 'chat_message_1', chat_channel: 'chat_channel_1' } })).toMatchObject({
            kind: 'chat.message',
            channelId: 'chat_channel_1',
            orderId: undefined,
        });
        expect(
            parseRealtimeEvent({ event: 'chat_participent.chat_message_received', data: { id: 'm', message: { channel: 'chat_channel_2' } } })?.channelId
        ).toBe('chat_channel_2');
    });

    it('knows which changes move the destination', () => {
        expect(changesDropoff(['items', 'dropoff'])).toBe(true);
        expect(changesDropoff(['notes'])).toBe(false);
        expect(changesDropoff(undefined)).toBe(false);
    });
});
