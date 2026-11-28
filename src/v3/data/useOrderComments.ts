/**
 * Comments on an order — the Details tab of the order screen.
 *
 * What the API carries for a driver token, read from the server:
 *
 *   GET  /v1/orders/{id}/comments   top-level comments, newest first, each
 *                                   with its author and replies
 *                                   (fleetops routes.php, OrderController@orderComments)
 *   POST /v1/comments               { subject_id, subject_type, content, visibility? }
 *                                   (core-api routes.php, CommentController@create)
 *
 * The order resource itself only embeds `comments` for the console
 * (Order.php: `$this->when($isInternal, …)`), so they are fetched here.
 *
 * A comment written through this API defaults to `customer` visibility on the
 * server (Comment::applyDefaultVisibility: orders are "visibility aware", and
 * anything that is not the console counts as customer-facing). A driver's note
 * is for dispatch, so it is posted as `internal` on purpose — a remark about a
 * locked gate should not land in the customer's tracking page.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFleetbase, isQueuedAck } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';
import { cachedGet, useCachedState } from './responseCache';

export interface CommentAuthor {
    id?: string;
    name?: string | null;
    avatar_url?: string | null;
}

export interface OrderComment {
    id: string;
    content?: string | null;
    author?: CommentAuthor | null;
    replies?: OrderComment[] | null;
    visibility?: string | null;
    /** True for the signed-in user's own comments. */
    editable?: boolean;
    created_at?: string;
    /** Set on a comment written offline and still waiting in the sync queue. */
    pending?: boolean;
}

export type CommentPostOutcome = 'sent' | 'queued' | 'failed';

function rowsOf(raw: unknown): OrderComment[] {
    const body = (raw as { data?: unknown })?.data ?? raw;
    return Array.isArray(body) ? (body as OrderComment[]) : [];
}

/** The server sends newest first; a thread reads oldest first. */
const threadOf = (raw: unknown): OrderComment[] => [...rowsOf(raw)].reverse();

export function useOrderComments(orderId?: string, reloadToken = 0) {
    const { adapter } = useFleetbase();
    // Opens on the comments as they were last read; the load below brings any since.
    const [comments, setComments] = useCachedState<OrderComment[]>(orderId ? `orders/${orderId}/comments` : undefined, undefined, threadOf);
    const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const [isPosting, setIsPosting] = useState(false);
    const [postError, setPostError] = useState<string | null>(null);
    const inFlight = useRef(false);
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    const load = useCallback(async () => {
        if (!orderId || inFlight.current) return;
        inFlight.current = true;
        setState('loading');
        setError(null);
        try {
            const rows = threadOf(await cachedGet(adapter, `orders/${orderId}/comments`));
            if (!alive.current) return;
            // Anything still queued on this device stays at the end until it lands.
            setComments((previous) => rows.concat((previous ?? []).filter((c) => c.pending)));
            setState('ready');
        } catch (err) {
            if (!alive.current) return;
            setError(err as ApiError);
            setState('error');
        } finally {
            inFlight.current = false;
        }
    }, [adapter, orderId, setComments]);

    useEffect(() => {
        void load();
    }, [load, reloadToken]);

    const post = useCallback(
        async (content: string): Promise<CommentPostOutcome> => {
            const text = content.trim();
            if (!orderId || !text) return 'failed';
            setIsPosting(true);
            setPostError(null);
            try {
                const result = await adapter.post('comments', {
                    subject_id: orderId,
                    // `package:model`, which the server resolves to Fleetbase\FleetOps\Models\Order.
                    subject_type: 'fleet-ops:order',
                    content: text,
                    visibility: 'internal',
                });
                if (isQueuedAck(result)) {
                    // Shown at once and marked as waiting, so the driver does not type it twice.
                    const pending: OrderComment = { id: `pending-${Date.now()}`, content: text, created_at: new Date().toISOString(), editable: true, pending: true };
                    if (alive.current) setComments((previous) => [...(previous ?? []), pending]);
                    return 'queued';
                }
                const row = ((result as { data?: unknown })?.data ?? result) as OrderComment;
                if (alive.current && row?.id) setComments((previous) => [...(previous ?? []), row]);
                return 'sent';
            } catch (err) {
                if (alive.current) setPostError((err as Error).message);
                return 'failed';
            } finally {
                if (alive.current) setIsPosting(false);
            }
        },
        [adapter, orderId, setComments]
    );

    return {
        comments,
        state,
        error,
        isLoading: state === 'loading' && !comments,
        failed: state === 'error',
        reload: load,
        post,
        isPosting,
        postError,
    };
}
