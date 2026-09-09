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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFleetbase, isQueuedAck } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';

export interface ChatParticipant {
    id: string;
    /** Present on channel participants; absent on `available-participants`. */
    user?: string;
    /** "admin", "customer", "driver" — G3's role line. */
    type?: string;
    name?: string;
    username?: string;
    email?: string;
    avatar_url?: string;
    is_online?: boolean;
    last_seen_at?: string;
}

export interface ChatAttachment {
    id?: string;
    /** The file's public id. */
    file?: string;
    url?: string | null;
    filename?: string | null;
    content_type?: string | null;
}

export interface ChatMessage {
    id: string;
    sender?: ChatParticipant;
    content?: string;
    attachments?: ChatAttachment[];
    receipts?: { id?: string; participant?: string }[];
    created_at?: string;
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
    updated_at?: string;
    created_at?: string;
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

export function useChatChannels(reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [channels, setChannels] = useState<ChatChannelRecord[] | null>(null);
    const [state, setState] = useState<ChatLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);

    const load = useCallback(
        async (mode: 'loading' | 'refreshing' = 'loading') => {
            if (inFlight.current) return;
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
        [adapter, reloadToken]
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
    }, [load]);

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

export function useSendMessage(channelId?: string, senderParticipantId?: string) {
    const { adapter } = useFleetbase();
    const [isSending, setIsSending] = useState(false);
    const [queued, setQueued] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const send = useCallback(
        async (content: string, files: string[] = []): Promise<ChatMessage | null> => {
            const body = content.trim();
            if (!channelId || (!body && !files.length)) return null;
            if (!senderParticipantId) {
                // Without a participant record the API 422s; say so rather than
                // letting the driver type into a void.
                setError('missing-participant');
                return null;
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
                    return null;
                }
                return ((result as { data?: unknown })?.data ?? result) as ChatMessage;
            } catch (err) {
                setError((err as Error).message);
                return null;
            } finally {
                setIsSending(false);
            }
        },
        [adapter, channelId, senderParticipantId]
    );

    return { send, isSending, queued, error, clearError: useCallback(() => setError(null), []) };
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
                const raw = await adapter.post('chat-channels', { name });
                if (isQueuedAck(raw)) return null;
                const channel = ((raw as { data?: unknown })?.data ?? raw) as ChatChannelRecord;

                // Participants are added one at a time — there is no bulk route.
                for (const user of participantUserIds) {
                    await adapter.post(`chat-channels/${channel.id}/add-participant`, { user });
                }
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
