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

export interface ServerActivity extends FlowActivity {
    _resolved_status?: string | null;
    _resolved_details?: string | null;
}

export type NextActivitySource = 'server' | 'local';

export function useNextActivity(orderId?: string, status?: string | null, reloadToken: unknown = 0) {
    const { adapter } = useFleetbase();
    const [activities, setActivities] = useState<ServerActivity[] | null>(null);
    const [source, setSource] = useState<NextActivitySource>('local');
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
            const raw = await adapter.get(`orders/${orderId}/next-activity`);
            const rows = Array.isArray(raw) ? raw : (raw as { data?: unknown })?.data;
            if (!alive.current) return;
            if (Array.isArray(rows)) {
                setActivities(
                    rows.filter((a): a is ServerActivity => !!a && typeof a === 'object' && typeof (a as { code?: unknown }).code === 'string')
                );
                setSource('server');
            } else {
                setActivities(null);
                setSource('local');
            }
        } catch {
            if (!alive.current) return;
            setActivities(null);
            setSource('local');
        } finally {
            if (alive.current) setIsLoading(false);
        }
    }, [adapter, orderId]);

    useEffect(() => {
        void load();
        // `status` is a dependency on purpose: every advance asks again.
    }, [load, status, reloadToken]);

    return { activities, source, isLoading, reload: load };
}
