/** What to call a chat, and what it is about. */
import { channelOrderId, channelTitle, displayIdOf, isGroupChannel, orderStore, otherParticipants, participantRole, type ChatChannelRecord } from '../../data';

type T = (key: string, options?: Record<string, unknown>) => string;

/**
 * The name at the top of a card or a conversation.
 *
 * An order's chat is named by the server after the order ("Order order_x7…"),
 * which tells a driver nothing about who is on the other end, and the order is
 * shown on its own line anyway. So an order chat is named after the people in
 * it, and every other chat keeps the title it was given.
 */
export function chatName(channel: ChatChannelRecord | null | undefined, userId: string | undefined, t: T): string {
    if (channelOrderId(channel)) {
        const names = otherParticipants(channel, userId)
            .map((p) => p.name)
            .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
        if (names.length) return names.join(', ');
    }
    return channelTitle(channel ?? undefined, userId, t('inbox.untitled'));
}

/**
 * The order a chat is linked to, as the driver knows it: the full tracking
 * number when the order is on this device, otherwise the id the channel carries.
 */
export function chatOrderLabel(channel: ChatChannelRecord | null | undefined): { orderId: string; label: string } | undefined {
    const orderId = channelOrderId(channel);
    if (!orderId) return undefined;
    const order = orderStore.get(orderId);
    return { orderId, label: (order ? displayIdOf(order) : '') || orderId };
}

/**
 * The quiet line under the name when the chat is not about an order: how many
 * people for a room, or which side of an order the other person is on. Nothing
 * when the server says neither; a made-up line would be worse than none.
 */
export function chatContext(channel: ChatChannelRecord | null | undefined, userId: string | undefined, t: T): string | undefined {
    if (isGroupChannel(channel)) return t('inbox.peopleCount', { count: (channel?.participants ?? []).length });
    const role = participantRole(otherParticipants(channel, userId)[0]);
    return role === 'store' || role === 'customer' || role === 'driver' ? t(`conversation.role.${role}`) : undefined;
}
