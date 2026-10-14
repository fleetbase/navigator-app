import { findOrderChatChannel, isStorefrontOrder } from '../src/utils/chat';

const sdkOrder = (attributes) => ({
    id: attributes.public_id,
    getAttribute: (key) => attributes[key],
});

const channels = [
    { id: 'chat_general', name: 'General', meta: {} },
    { id: 'chat_other', name: 'Order order_other', meta: { storefront_order_uuid: 'uuid-other', storefront_order_id: 'order_other' } },
    { id: 'chat_mine', name: 'Order order_mine', meta: { storefront_order_uuid: 'uuid-mine', storefront_order_id: 'order_mine' } },
    { id: 'chat_no_meta', name: 'No meta' },
];

describe('isStorefrontOrder', () => {
    test('is true when the order meta has a storefront_id', () => {
        expect(isStorefrontOrder(sdkOrder({ meta: { storefront_id: 'store_1' } }))).toBe(true);
        expect(isStorefrontOrder({ meta: { storefront_id: 'store_1' } })).toBe(true);
    });

    test('is false for non-storefront or missing orders', () => {
        expect(isStorefrontOrder(sdkOrder({ meta: {} }))).toBe(false);
        expect(isStorefrontOrder(sdkOrder({ meta: null }))).toBe(false);
        expect(isStorefrontOrder({})).toBe(false);
        expect(isStorefrontOrder(null)).toBe(false);
    });
});

describe('findOrderChatChannel', () => {
    test('matches the channel by storefront_order_uuid', () => {
        const order = sdkOrder({ uuid: 'uuid-mine', public_id: 'order_unrelated' });
        expect(findOrderChatChannel(channels, order).id).toBe('chat_mine');
    });

    test('falls back to matching storefront_order_id against the public id', () => {
        expect(findOrderChatChannel(channels, sdkOrder({ public_id: 'order_mine' })).id).toBe('chat_mine');
        expect(findOrderChatChannel(channels, { id: 'order_mine' }).id).toBe('chat_mine');
    });

    test('returns null when no channel belongs to the order', () => {
        expect(findOrderChatChannel(channels, sdkOrder({ uuid: 'uuid-none', public_id: 'order_none' }))).toBeNull();
        expect(findOrderChatChannel([], sdkOrder({ uuid: 'uuid-mine' }))).toBeNull();
        expect(findOrderChatChannel(undefined, sdkOrder({ uuid: 'uuid-mine' }))).toBeNull();
        expect(findOrderChatChannel(channels, null)).toBeNull();
    });
});
