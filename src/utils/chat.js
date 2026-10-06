// Orders reach components either as SDK resources or as serialized objects
// (route params), so read attributes in a way that works for both.
function getOrderAttribute(order, key) {
    if (!order) return undefined;
    if (typeof order.getAttribute === 'function') {
        return order.getAttribute(key);
    }
    return order[key];
}

export function isStorefrontOrder(order) {
    const meta = getOrderAttribute(order, 'meta');
    return Boolean(meta && meta.storefront_id);
}

// The storefront backend creates one chat channel per order when a driver is
// assigned, and tags it with the order's uuid and public id in the channel meta.
export function findOrderChatChannel(channels, order) {
    if (!Array.isArray(channels) || !order) return null;

    const orderUuid = getOrderAttribute(order, 'uuid');
    const orderPublicId = getOrderAttribute(order, 'public_id') ?? order.id;

    return (
        channels.find((channel) => {
            const meta = channel?.meta;
            if (!meta) return false;
            if (orderUuid && meta.storefront_order_uuid === orderUuid) return true;
            if (orderPublicId && meta.storefront_order_id === orderPublicId) return true;
            return false;
        }) ?? null
    );
}
