/**
 * The next activity, asked of the server.
 *
 * `GET /v1/orders/{id}/next-activity` runs FleetOps' own `nextActivity()` —
 * the graph walk *and* the `logic` conditions the app cannot evaluate — and
 * resolves POD requirements for the order. When it answers, its answer wins:
 * the app no longer guesses the next step from an array, and a branch that
 * depends on conditions is resolved instead of deferred to dispatch.
 *
 * When it does not (offline, an older server, a config error) the screen falls
 * back to the client-side sequencer in `activityFlow`, which is what it did
 * before. `source` says which one is speaking.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFleetbase } from '../api';
import type { FlowActivity } from './activityFlow';
import { cachedGet, cacheParams, peekCache, useCachedState } from './responseCache';

export interface ServerActivity extends FlowActivity {
    _resolved_status?: string | null;
    _resolved_details?: string | null;
}

export type NextActivitySource = 'server' | 'local';

/** The server's activities out of an answer, or undefined for an answer that is not a list of them. */
function activitiesOf(raw: unknown): ServerActivity[] | undefined {
    const rows = Array.isArray(raw) ? raw : (raw as { data?: unknown })?.data;
    if (!Array.isArray(rows)) return undefined;
    return rows.filter((a): a is ServerActivity => !!a && typeof a === 'object' && typeof (a as { code?: unknown }).code === 'string');
}

/** A day on, the order config behind a kept answer may have been edited. */
const NEXT_ACTIVITY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function useNextActivity(orderId?: string, status?: string | null, reloadToken: unknown = 0) {
    const { adapter } = useFleetbase();
    /*
     * Kept per status as well as per order: the next step from "dispatched"
     * is not the next step from "picked up", and the request itself does not
     * name the status, so it goes into the key only. A kept answer is the
     * server speaking, from a moment ago, so the source says so.
     */
    const statusKey = status ?? '';
    const keyParams = { status: statusKey };
    const [kept, setKept] = useCachedState<{ activities: ServerActivity[] | null; source: NextActivitySource }>(
        orderId ? `orders/${orderId}/next-activity` : undefined,
        cacheParams(undefined, keyParams),
        (raw) => {
            const rows = activitiesOf(raw);
            return rows ? { activities: rows, source: 'server' } : undefined;
        },
        { maxAgeMs: NEXT_ACTIVITY_MAX_AGE_MS, fallback: { activities: null, source: 'local' } }
    );
    const activities = kept?.activities ?? null;
    const source = kept?.source ?? 'local';
    const setActivities = useCallback((next: ServerActivity[] | null) => setKept((previous) => ({ activities: next, source: previous?.source ?? 'local' })), [setKept]);
    const setSource = useCallback((next: NextActivitySource) => setKept((previous) => ({ activities: previous?.activities ?? null, source: next })), [setKept]);
    const [isLoading, setIsLoading] = useState(false);
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    const load = useCallback(async () => {
        if (!orderId) return;
        setIsLoading(true);
        try {
            const raw = await cachedGet(adapter, `orders/${orderId}/next-activity`, undefined, { keyParams: { status: statusKey } });
            const rows = activitiesOf(raw);
            if (!alive.current) return;
            if (rows) {
                setActivities(rows);
                setSource('server');
            } else {
                setActivities(null);
                setSource('local');
            }
        } catch {
            if (!alive.current) return;
            /*
             * No answer now, but one for this very status may be kept: that is
             * still the server's word, and better than the phone's guess. Read
             * by status, because what is held may be the previous status's.
             */
            const keptRows = activitiesOf(peekCache(`orders/${orderId}/next-activity`, cacheParams(undefined, { status: statusKey }), { maxAgeMs: NEXT_ACTIVITY_MAX_AGE_MS }));
            setActivities(keptRows ?? null);
            setSource(keptRows ? 'server' : 'local');
        } finally {
            if (alive.current) setIsLoading(false);
        }
    }, [adapter, orderId, statusKey, setActivities, setSource]);

    useEffect(() => {
        void load();
        // `status` is a dependency on purpose: every advance asks again.
    }, [load, status, reloadToken]);

    return { activities, source, isLoading, reload: load };
}
