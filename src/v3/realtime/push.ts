/**
 * Push notifications, v3's half.
 *
 * The device registration and the native listeners belong to the host (v2's
 * NotificationProvider owns `react-native-notifications`); v3 is handed a
 * subscribe function and decides what a push *means*. Two moments matter:
 *
 *   - **received** while the app is in the foreground: the data changed, so
 *     refresh it — exactly what the matching socket event would have done,
 *     which covers a socket that was down when the event was broadcast.
 *   - **opened**: the driver tapped it, so also take them to what it is about.
 *
 * Payload shapes (Fleet-Ops / core-api notifications):
 *   order_assigned        { type, id: order_xxx }
 *   order_changed         { type, id, changes } — body is the summary
 *   order_unassigned      { type, id }
 *   order_dispatched, order_canceled, … { type, id }
 *   chat_message_received { type, id: message, channel: chat_channel_xxx }
 *
 * FCM delivers data values as strings, so `changes` may arrive JSON-encoded.
 */
import { createContext, useContext } from 'react';
import type { RealtimeEvent, RealtimeEventKind } from './events';

export type PushAction = 'received' | 'opened';

export interface PushNotificationLike {
    payload?: Record<string, unknown> | null;
    title?: string;
    body?: string;
    [key: string]: unknown;
}

export type PushListener = (notification: PushNotificationLike, action: PushAction) => void;
/** Registers a listener; returns its removal. */
export type PushSubscribe = (listener: PushListener) => () => void;

export const PushContext = createContext<PushSubscribe | undefined>(undefined);
export const usePushSubscribe = () => useContext(PushContext);

export interface ParsedPush {
    type?: string;
    orderId?: string;
    channelId?: string;
    summary?: string;
    changes?: string[];
}

function str(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
}

function listOf(value: unknown): string[] | undefined {
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
    if (typeof value === 'string' && value) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string');
        } catch {
            return value.split(',').map((v) => v.trim()).filter(Boolean);
        }
    }
    return undefined;
}

/** Total: anything in, a (possibly empty) description out. */
export function parsePush(notification?: PushNotificationLike | null): ParsedPush {
    const payload = (notification?.payload ?? {}) as Record<string, unknown>;
    // Some transports nest the data block; read both.
    const data = (payload.data && typeof payload.data === 'object' ? payload.data : payload) as Record<string, unknown>;
    const type = str(data.type) ?? str(payload.type);
    const id = str(data.id) ?? str(payload.id);
    const isChat = type === 'chat_message_received';
    return {
        type,
        orderId: !isChat && id && id.startsWith('order_') ? id : undefined,
        channelId: isChat ? (str(data.channel) ?? str(payload.channel)) : undefined,
        summary: str(payload.body) ?? str(notification?.body) ?? str(data.summary),
        changes: listOf(data.changes),
    };
}

/** The realtime kind a push stands for, so both paths share one handler. */
function kindOf(push: ParsedPush): RealtimeEventKind | undefined {
    switch (push.type) {
        case 'order_changed':
            return 'order.changed';
        case 'order_unassigned':
            return 'order.unassigned';
        case 'order_assigned':
            return 'order.assigned';
        case 'chat_message_received':
            return 'chat.message';
        default:
            // Any other order notification still means "this order moved".
            return push.orderId ? 'order.updated' : undefined;
    }
}

/** A push restated as the socket event it duplicates. */
export function pushToEvent(push: ParsedPush): RealtimeEvent | undefined {
    const kind = kindOf(push);
    if (!kind) return undefined;
    return {
        kind,
        orderId: push.orderId,
        channelId: push.channelId,
        summary: push.summary,
        changes: push.changes,
        raw: { event: push.type, data: { id: push.orderId, channel: push.channelId } },
    };
}

/** Where a tapped push should take the driver. */
export type PushDestination = { kind: 'order'; orderId: string } | { kind: 'orders' } | { kind: 'conversation'; channelId: string };

export function destinationOf(push: ParsedPush): PushDestination | undefined {
    if (push.type === 'chat_message_received') return push.channelId ? { kind: 'conversation', channelId: push.channelId } : undefined;
    // The order is no longer theirs to open; the list says why.
    if (push.type === 'order_unassigned') return { kind: 'orders' };
    return push.orderId ? { kind: 'order', orderId: push.orderId } : undefined;
}
