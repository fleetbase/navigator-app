/**
 * What the driver wants to be rung about: `drivers/{id}/notification-preferences`.
 *
 * The answer lives on the server, because the server is what sends the push.
 * Each kind is on until switched off; switching one off stops its push, while
 * the open app still hears about it live. A server without the route answers
 * nothing and `preferences` stays null, so the screen shows no switches rather
 * than switches that change nothing.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFleetbase } from '../api';

export type AlertKind = 'new_work' | 'order_changes' | 'messages' | 'offers';
export type AlertPreferences = Record<AlertKind, boolean>;

const KINDS: AlertKind[] = ['new_work', 'order_changes', 'messages', 'offers'];

function read(raw: unknown): AlertPreferences | null {
    const body = ((raw as { data?: unknown })?.data ?? raw) as { preferences?: Record<string, unknown> } | null;
    const given = body?.preferences;
    if (!given || typeof given !== 'object') return null;
    return Object.fromEntries(KINDS.map((kind) => [kind, given[kind] !== false])) as AlertPreferences;
}

export function useNotificationPreferences(driverId?: string | null) {
    const { adapter } = useFleetbase();
    const [preferences, setPreferences] = useState<AlertPreferences | null>(null);
    const [failed, setFailed] = useState<AlertKind | null>(null);

    useEffect(() => {
        if (!driverId) return;
        let alive = true;
        adapter
            .get(`drivers/${driverId}/notification-preferences`)
            .then((raw) => {
                if (alive) setPreferences(read(raw));
            })
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [adapter, driverId]);

    const set = useCallback(
        async (kind: AlertKind, value: boolean) => {
            if (!driverId || !preferences) return;
            const before = preferences;
            setFailed(null);
            // The switch moves at once; it moves back if the server does not take it.
            setPreferences({ ...before, [kind]: value });
            try {
                const saved = read(await adapter.put(`drivers/${driverId}/notification-preferences`, { [kind]: value }));
                if (saved) setPreferences(saved);
            } catch {
                setPreferences(before);
                setFailed(kind);
            }
        },
        [adapter, driverId, preferences]
    );

    return { preferences, set, failed };
}

export default useNotificationPreferences;
