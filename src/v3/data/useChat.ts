/**
 * Inbox — R2 frames G1 (conversation), G2 (composer), G3 (participants).
 *
 * Chat lives in **core-api**, not fleetops, under `/v1/chat-channels` with the
 * `fleetbase.api` middleware — the same guard the driver's Sanctum token
 * already passes, so no backend work is needed for this surface.
 *
 * Two shapes drive everything here:
 *
 *   - A channel carries a **`feed`**: one ordered array of
 *     `{ type: 'log' | 'message', data, created_at }`. System events and
 *     messages are already interleaved server-side, which is exactly what G1's
 *     self / other / **system** bubbles need — no client-side merge.
 *   - People are identified by **user**, and messages are sent by
 *     **participant**. `POST {id}/send-message` takes `sender` = the *chat
 *     participant* id, not a user or driver id, so the driver's own participant
 *     record has to be found in the channel first (`participant.user === my
 *     user id`). Sending the wrong id 422s.
 *
 * Logs carry both `content` (`"{subject.0.name} has created a new chat."`) and
 * `resolved_content` (`"Ron has created a new chat."`). Only the resolved form
 * is fit to show.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useFleetbase, isQueuedAck } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';
import { bumpChatRefresh, useChatRefresh } from '../realtime/liveRefresh';

export interface ChatParticipant {
    id: string;
    /** Present on channel participants; absent on `available-participants`. */
    user?: string;
    /** "admin", "customer", "driver" — G3's role line. */
    type?: string;
    name?: string;
    username?: string;
    email?: string;
    /** The user's phone, when they have one — what makes a call button real. */
    phone?: string | null;
    avatar_url?: string;
    is_online?: boolean;
    last_seen_at?: string;
    /** Order chat (contract 5): who this participant is *in the order*. */
    role?: ParticipantRole | string;
    meta?: { role?: ParticipantRole | string; [key: string]: unknown } | null;
}

export type ParticipantRole = 'customer' | 'driver' | 'store' | 'system';

export interface ChatAttachment {
    id?: string;
    /** The file's public id. */
    file?: string;
    url?: string | null;
    filename?: string | null;
    content_type?: string | null;
    created_at?: string;
}

/** One participant having read one message. Created by `POST read-message/{id}`. */
export interface ChatReceipt {
    id?: string;
    /** The reader's *participant* id. */
    participant?: string;
    participant_name?: string | null;
    read_at?: string | null;
}

export interface ChatMessage {
    id: string;
    sender?: ChatParticipant;
    content?: string;
    attachments?: ChatAttachment[];
    receipts?: ChatReceipt[];
    created_at?: string;
    /** The server's own verdict on `meta.system`. */
    system?: boolean;
    /** `{ system: true, kind }` marks a message the platform wrote, not a person. */
    meta?: { system?: boolean; kind?: string; [key: string]: unknown } | null;
}

export interface ChatLog {
    id: string;
    /** Placeholders already substituted — always prefer this to `content`. */
    resolved_content?: string;
    content?: string;
    event_type?: string;
    created_at?: string;
}

export interface FeedEntry {
    type: 'log' | 'message' | string;
    data: ChatMessage & ChatLog;
    created_at?: string;
}

export interface ChatChannelRecord {
    id: string;
    name?: string;
    title?: string;
    unread_count?: number;
    last_message?: ChatMessage | null;
    participants?: ChatParticipant[];
    feed?: FeedEntry[];
    /**
     * The channel list carries only each channel's latest entries and says so
     * here. `useChatChannel` fetches the channel by id, which returns the whole
     * feed, so an open conversation is never the cut one for long.
     */
    feed_truncated?: boolean;
    /** Order-linked threads: `{ storefront_order_uuid, kind, order_public_id }`. */
    meta?: ChatChannelMeta | null;
    updated_at?: string;
    created_at?: string;
}

/** Order chat kinds (contract 5): `driver` = driver + store staff; `group` = all three. */
export type OrderChatKind = 'customer' | 'driver' | 'group';

export interface ChatChannelMeta {
    storefront_order_uuid?: string;
    kind?: OrderChatKind | string;
    order_public_id?: string;
    /** Set by FleetOps when an order's chat is closed (`OrderChat::close`). */
    closed_at?: string;
    [key: string]: unknown;
}

/** The role a participant plays in an order thread, if the server said. */
export function participantRole(person?: ChatParticipant | null): string | undefined {
    const role = person?.meta?.role ?? person?.role;
    return typeof role === 'string' && role ? role : undefined;
}

/** A message the platform wrote — an edit notice, an address-change request. */
export function isSystemMessage(message?: ChatMessage | null): boolean {
    return Boolean(message?.system) || Boolean(message?.meta?.system) || participantRole(message?.sender) === 'system';
}

/** The order this channel is about, when it is about one. */
export function channelOrderId(channel?: ChatChannelRecord | null): string | undefined {
    const id = channel?.meta?.order_public_id;
    return typeof id === 'string' && id ? id : undefined;
}

export interface OrderThreads {
    /** The driver ↔ store thread — "Message dispatch". */
    dispatch?: ChatChannelRecord;
    /** A thread the customer is in with the driver — "Message customer". */
    customer?: ChatChannelRecord;
}

/**
 * The threads linked to an order, by kind.
 *
 * Only threads the driver can already see: the chat-channels API returns the
 * channels the signed-in user participates in, and there is no public route
 * to open an order thread (POST chat-channels takes no `meta`). A `customer`
 * thread is customer + store only, so the driver reaches the customer through
 * a `group` thread; a linked thread with no kind is the pre-contract
 * customer ↔ driver channel, which is that too.
 */
export function orderThreadsOf(channels: ChatChannelRecord[] | null | undefined, orderId?: string): OrderThreads {
    if (!orderId || !channels?.length) return {};
    const linked = channels.filter((c) => channelOrderId(c) === orderId);
    return {
        dispatch: linked.find((c) => c.meta?.kind === 'driver'),
        customer: linked.find((c) => c.meta?.kind === 'group') ?? linked.find((c) => !c.meta?.kind),
    };
}

/*
 * The Inbox badge. Written by the session-level chat watcher (which keeps the
 * channel list live), read by the tab bar — a tiny store so the count can
 * change without re-rendering the navigator.
 */
let unreadTotalNow = 0;
const unreadListeners = new Set<() => void>();
export function setChatUnreadTotal(n: number): void {
    if (n === unreadTotalNow) return;
    unreadTotalNow = n;
    for (const fn of unreadListeners) fn();
}
function subscribeUnread(fn: () => void): () => void {
    unreadListeners.add(fn);
    return () => {
        unreadListeners.delete(fn);
    };
}
const readUnread = () => unreadTotalNow;
export function useChatUnreadTotal(): number {
    return useSyncExternalStore(subscribeUnread, readUnread, readUnread);
}

/**
 * The user id behind a person, whichever endpoint produced them.
 *
 * A **channel participant** is a `chat_participant_*` record carrying a
 * separate `user` field. `available-participants` returns **User** records
 * outright, where the user id *is* `id`. Reading `.user` on those gives
 * undefined — which silently listed the driver as someone to start a
 * conversation with, and would have posted `add-participant` with no user.
 */
export function personUserId(person?: ChatParticipant | null): string | undefined {
    if (!person) return undefined;
    if (typeof person.user === 'string' && person.user) return person.user;
    return typeof person.id === 'string' && person.id.startsWith('user_') ? person.id : undefined;
}

/** The signed-in driver's participant record within a channel. */
export function myParticipant(channel?: ChatChannelRecord | null, userId?: string): ChatParticipant | undefined {
    if (!channel || !userId) return undefined;
    return (channel.participants ?? []).find((p) => p.user === userId);
}

/** Everyone but me — what a conversation is actually *with*. */
export function otherParticipants(channel?: ChatChannelRecord | null, userId?: string): ChatParticipant[] {
    return (channel?.participants ?? []).filter((p) => p.user !== userId);
}

/**
 * What to call a conversation.
 *
 * `title` is computed per viewer server-side and **already excludes the person
 * asking** — a channel whose participants are Ron, Emma, Daniel and Olivia
 * comes back to Ron titled "Emma Johnson, Daniel Martin, Olivia Smith". So the
 * server's title is preferred, and the participant list is only a fallback for
 * when it is missing (and then the driver is dropped, to match).
 */
export function channelTitle(channel: ChatChannelRecord | undefined, userId: string | undefined, fallback: string): string {
    const title = channel?.title?.trim();
    if (title) return title;

    const others = otherParticipants(channel, userId)
        .map((p) => p.name)
        .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
    if (others.length) return others.join(', ');

    return channel?.name || fallback;
}

/**
 * Whether a heading has already named everyone in the room.
 *
 * The conversation screen heads itself with the channel's title, and
 * `channelTitle` falls back to the participants' names when there is none — at
 * which point a "3 other people" line underneath spends a row restating what
 * the heading just said.
 *
 * Containment rather than equality: the server's own titles sometimes include
 * the viewer and sometimes do not, and "Ron, Charlotte Thomas" has named
 * Charlotte just as surely as "Charlotte Thomas" has.
 */
export function headingNamesEveryone(heading: string, others: { name?: string | null }[]): boolean {
    if (!others.length) return false;
    return others.every((p) => typeof p.name === 'string' && p.name.trim().length > 0 && heading.includes(p.name));
}

export type ChatLoadState = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

function unwrap(raw: unknown): unknown[] {
    if (Array.isArray(raw)) return raw;
    const data = (raw as { data?: unknown })?.data;
    return Array.isArray(data) ? data : [];
}

export function useChatChannels(reloadToken = 0, { enabled = true }: { enabled?: boolean } = {}) {
    const { adapter } = useFleetbase();
    // A message anywhere moves the list's unread counts and order.
    const chatRevision = useChatRefresh();
    const [channels, setChannels] = useState<ChatChannelRecord[] | null>(null);
    const [state, setState] = useState<ChatLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);

    const load = useCallback(
        async (mode: 'loading' | 'refreshing' = 'loading') => {
            if (!enabled || inFlight.current) return;
            inFlight.current = true;
            setState(mode);
            setError(null);
            try {
                const rows = unwrap(await adapter.get('chat-channels', { limit: 50 })) as ChatChannelRecord[];
                // Most recently active first — `updated_at` moves with each message.
                setChannels([...rows].sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? ''))));
                setState('ready');
            } catch (err) {
                setError(err as ApiError);
                setState('error');
            } finally {
                inFlight.current = false;
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [adapter, reloadToken, chatRevision, enabled]
    );

    useEffect(() => {
        void load(channels ? 'refreshing' : 'loading');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    const unreadTotal = useMemo(
        () => (channels ?? []).reduce((sum, c) => sum + (Number(c.unread_count) || 0), 0),
        [channels]
    );

    return {
        channels,
        unreadTotal,
        state,
        error,
        isLoading: state === 'loading' && !channels,
        isRefreshing: state === 'refreshing',
        failed: state === 'error',
        refresh: useCallback(() => load('refreshing'), [load]),
        retry: useCallback(() => load('loading'), [load]),
    };
}

export function useChatChannel(channelId?: string, seed?: ChatChannelRecord | null) {
    const { adapter } = useFleetbase();
    const chatRevision = useChatRefresh();
    const [channel, setChannel] = useState<ChatChannelRecord | null>(seed ?? null);
    const [state, setState] = useState<ChatLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);

    const load = useCallback(async () => {
        if (!channelId || inFlight.current) return;
        inFlight.current = true;
        setState('loading');
        setError(null);
        try {
            const raw = await adapter.get(`chat-channels/${channelId}`);
            setChannel((((raw as { data?: unknown })?.data ?? raw) ?? null) as ChatChannelRecord | null);
            setState('ready');
        } catch (err) {
            setError(err as ApiError);
            setState('error');
        } finally {
            inFlight.current = false;
        }
    }, [adapter, channelId]);

    useEffect(() => {
        void load();
    }, [load, chatRevision]);

    return {
        channel,
        state,
        error,
        // The seed from the list is enough to paint the header immediately.
        isLoading: state === 'loading' && !channel,
        isBlocked: state === 'error' && !channel,
        reload: load,
        setChannel,
    };
}

export type SendOutcome = { kind: 'sent'; message: ChatMessage } | { kind: 'queued' } | { kind: 'failed'; reason: string } | { kind: 'empty' };

export function useSendMessage(channelId?: string, senderParticipantId?: string) {
    const { adapter } = useFleetbase();
    const [isSending, setIsSending] = useState(false);
    const [queued, setQueued] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /** Sends, and says what became of it: sent, saved for later, or refused. */
    const deliver = useCallback(
        async (content: string, files: string[] = []): Promise<SendOutcome> => {
            const body = content.trim();
            if (!channelId || (!body && !files.length)) return { kind: 'empty' };
            if (!senderParticipantId) {
                // Without a participant record the API 422s; say so rather than
                // letting the driver type into a void.
                setError('missing-participant');
                return { kind: 'failed', reason: 'missing-participant' };
            }

            setIsSending(true);
            setError(null);
            try {
                const result = await adapter.post(`chat-channels/${channelId}/send-message`, {
                    sender: senderParticipantId,
                    content: body,
                    // File public ids, already uploaded; the server attaches them.
                    ...(files.length ? { files } : {}),
                });
                if (isQueuedAck(result)) {
                    setQueued(true);
                    return { kind: 'queued' };
                }
                return { kind: 'sent', message: ((result as { data?: unknown })?.data ?? result) as ChatMessage };
            } catch (err) {
                const reason = (err as Error).message;
                setError(reason);
                return { kind: 'failed', reason };
            } finally {
                setIsSending(false);
            }
        },
        [adapter, channelId, senderParticipantId]
    );

    const send = useCallback(
        async (content: string, files: string[] = []): Promise<ChatMessage | null> => {
            const outcome = await deliver(content, files);
            return outcome.kind === 'sent' ? outcome.message : null;
        },
        [deliver]
    );

    return { send, deliver, isSending, queued, error, clearError: useCallback(() => setError(null), []) };
}

/** G3's picker. Returns everyone in the org who can be added to a channel. */
export function useAvailableParticipants(enabled = true) {
    const { adapter } = useFleetbase();
    const [people, setPeople] = useState<ChatParticipant[] | null>(null);
    const [state, setState] = useState<ChatLoadState>('idle');

    const load = useCallback(async () => {
        if (!enabled) return;
        setState('loading');
        try {
            setPeople(unwrap(await adapter.get('chat-channels/available-participants')) as ChatParticipant[]);
            setState('ready');
        } catch {
            setPeople(null);
            setState('error');
        }
    }, [adapter, enabled]);

    useEffect(() => {
        void load();
    }, [load]);

    return { people, isLoading: state === 'loading', failed: state === 'error', retry: load };
}

export function useCreateChannel() {
    const { adapter } = useFleetbase();
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const create = useCallback(
        async (name: string, participantUserIds: string[]): Promise<ChatChannelRecord | null> => {
            setIsCreating(true);
            setError(null);
            try {
                /*
                 * `participants` (user public ids) is read by the create
                 * endpoint itself, so the room and everyone in it are made in
                 * one request. Adding people one by one afterwards could leave
                 * a real channel with only some of them in it.
                 */
                const raw = await adapter.post('chat-channels', { name, participants: participantUserIds });
                if (isQueuedAck(raw)) return null;
                const channel = ((raw as { data?: unknown })?.data ?? raw) as ChatChannelRecord;
                return channel;
            } catch (err) {
                setError((err as Error).message);
                return null;
            } finally {
                setIsCreating(false);
            }
        },
        [adapter]
    );

    return { create, isCreating, error };
}

/* ── What a message is made of ─────────────────────────────────────────────── */

export type AttachmentKind = 'image' | 'audio' | 'file';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i;
const AUDIO_EXT = /\.(m4a|aac|mp3|wav|ogg|oga|opus|amr|3gp|caf|weba)$/i;

/**
 * Photo, voice message, or some other file.
 *
 * The content type is what the uploader declared, and a console upload of an
 * unknown type arrives as `application/octet-stream`, so the file name's
 * extension is the fallback.
 */
export function attachmentKind(attachment?: ChatAttachment | null): AttachmentKind {
    const type = String(attachment?.content_type ?? '').toLowerCase();
    const name = String(attachment?.filename ?? '');
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('audio/')) return 'audio';
    if (IMAGE_EXT.test(name)) return 'image';
    if (AUDIO_EXT.test(name)) return 'audio';
    return 'file';
}

/*
 * A shared position travels as an ordinary text message holding a map link:
 * the chat API has no location type, and a link still works for whoever reads
 * it in the console or in an older build.
 */
const LOCATION_LINK = /https:\/\/maps\.google\.com\/\?q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;

export function locationMessageContent(latitude: number, longitude: number): string {
    return `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

/** The position inside a message that is nothing but a shared location. */
export function locationOfMessage(content?: string | null): { latitude: number; longitude: number; url: string } | undefined {
    const text = (content ?? '').trim();
    const match = LOCATION_LINK.exec(text);
    // Only when the link is the whole message; a link inside a sentence stays a sentence.
    if (!match || match[0] !== text) return undefined;
    return { latitude: Number(match[1]), longitude: Number(match[2]), url: match[0] };
}

export type MessagePreviewKind = 'none' | 'text' | 'image' | 'audio' | 'file' | 'location';

/** What the last message *is*, for the inbox card's preview strip. */
export function messagePreviewKind(message?: ChatMessage | null): MessagePreviewKind {
    if (!message) return 'none';
    const attachments = message.attachments ?? [];
    if (attachments.length) {
        const kinds = attachments.map(attachmentKind);
        if (kinds.includes('audio')) return 'audio';
        if (kinds.includes('image')) return 'image';
        return 'file';
    }
    if (locationOfMessage(message.content)) return 'location';
    return message.content?.trim() ? 'text' : 'none';
}

/** More than the driver and one other person. */
export function isGroupChannel(channel?: ChatChannelRecord | null): boolean {
    return (channel?.participants ?? []).length > 2;
}

/** FleetOps closed this order's chat; the customer side already refuses to post to it. */
export function isChannelClosed(channel?: ChatChannelRecord | null): boolean {
    return typeof channel?.meta?.closed_at === 'string' && channel.meta.closed_at.length > 0;
}

/** Receipts left by anyone but the sender: the people who have read a message of mine. */
export function readersOf(message?: ChatMessage | null): ChatReceipt[] {
    const sender = message?.sender?.id;
    return (message?.receipts ?? []).filter((r) => !!r.participant && r.participant !== sender);
}

/**
 * Marks what the driver is looking at as read.
 *
 * The server counts a message as unread until the reader's own participant
 * has a receipt on it, and the only way to leave one is one request per
 * message (`POST read-message/{id}`); there is no "read up to here". Without
 * this the tab's unread count only ever grew.
 *
 * Only while online: a receipt is worth nothing queued, and a queue full of
 * them would bury the driver's real work on the sync screen.
 */
export function useMarkChannelRead(channel: ChatChannelRecord | null | undefined, myParticipantId: string | undefined, enabled = true): void {
    const { adapter } = useFleetbase();
    const attempted = useRef(new Set<string>());

    useEffect(() => {
        if (!enabled || !channel || !myParticipantId) return;
        const unread = (channel.feed ?? [])
            .filter((entry) => entry.type === 'message' && !!entry.data?.id)
            .map((entry) => entry.data as ChatMessage)
            .filter((m) => m.sender?.id !== myParticipantId && !(m.receipts ?? []).some((r) => r.participant === myParticipantId) && !attempted.current.has(m.id));
        if (!unread.length) return;

        for (const message of unread) attempted.current.add(message.id);
        void (async () => {
            let marked = 0;
            for (const message of unread) {
                try {
                    const result = await adapter.post(`chat-channels/read-message/${message.id}`, { participant: myParticipantId });
                    if (!isQueuedAck(result)) marked += 1;
                } catch {
                    // Let the next load of the channel try this one again.
                    attempted.current.delete(message.id);
                }
            }
            // The inbox list and the tab badge hold counts of their own.
            if (marked) bumpChatRefresh();
        })();
    }, [adapter, channel, myParticipantId, enabled]);
}

/** Deletes a message. The server soft-deletes it; the feed simply stops returning it. */
export function useDeleteMessage() {
    const { adapter } = useFleetbase();
    const [isDeleting, setIsDeleting] = useState(false);

    const remove = useCallback(
        async (messageId: string): Promise<boolean> => {
            setIsDeleting(true);
            try {
                const result = await adapter.delete(`chat-channels/delete-message/${messageId}`);
                return !isQueuedAck(result);
            } catch {
                return false;
            } finally {
                setIsDeleting(false);
            }
        },
        [adapter]
    );

    return { remove, isDeleting };
}
