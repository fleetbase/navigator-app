/**
 * What a push means. The payloads are the server's (Fleet-Ops OrderAssigned /
 * OrderChanged / unassign, core-api ChatMessageReceived); a wrong reading is a
 * driver tapping a notification and landing nowhere.
 */
import { parsePush, pushToEvent, destinationOf } from '../push';

describe('parsePush', () => {
    it('reads an order change, decoding the FCM string-encoded change list', () => {
        const push = parsePush({ payload: { type: 'order_changed', id: 'order_1', changes: '["dropoff","items"]', body: 'Drop-off changed' } });
        expect(push).toMatchObject({ type: 'order_changed', orderId: 'order_1', changes: ['dropoff', 'items'], summary: 'Drop-off changed' });
    });

    it('reads a chat message by its channel, not its message id', () => {
        const push = parsePush({ payload: { type: 'chat_message_received', id: 'chat_message_1', channel: 'chat_channel_1' } });
        expect(push.channelId).toBe('chat_channel_1');
        expect(push.orderId).toBeUndefined();
    });

    it('is total', () => {
        for (const junk of [undefined, null, {}, { payload: null }, { payload: { id: 42 } }]) {
            expect(() => parsePush(junk as never)).not.toThrow();
        }
    });
});

describe('pushToEvent / destinationOf', () => {
    it('treats each push as the socket event it duplicates', () => {
        expect(pushToEvent(parsePush({ payload: { type: 'order_unassigned', id: 'order_1' } }))?.kind).toBe('order.unassigned');
        expect(pushToEvent(parsePush({ payload: { type: 'order_assigned', id: 'order_1' } }))?.kind).toBe('order.assigned');
        expect(pushToEvent(parsePush({ payload: { type: 'order_dispatched', id: 'order_1' } }))?.kind).toBe('order.updated');
        expect(pushToEvent(parsePush({ payload: { type: 'chat_message_received', channel: 'c' } }))?.kind).toBe('chat.message');
        expect(pushToEvent(parsePush({ payload: { type: 'something_else' } }))).toBeUndefined();
    });

    it('routes a tap to the order, the list, or the conversation', () => {
        expect(destinationOf(parsePush({ payload: { type: 'order_changed', id: 'order_1' } }))).toEqual({ kind: 'order', orderId: 'order_1' });
        expect(destinationOf(parsePush({ payload: { type: 'order_assigned', id: 'order_2' } }))).toEqual({ kind: 'order', orderId: 'order_2' });
        // A reassigned order is not theirs to open; the list explains.
        expect(destinationOf(parsePush({ payload: { type: 'order_unassigned', id: 'order_3' } }))).toEqual({ kind: 'orders' });
        expect(destinationOf(parsePush({ payload: { type: 'chat_message_received', channel: 'chat_channel_1' } }))).toEqual({
            kind: 'conversation',
            channelId: 'chat_channel_1',
        });
    });
});
