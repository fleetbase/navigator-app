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
import { cachedGet, putCache, useCachedState } from './responseCache';

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
    const path = driverId ? `drivers/${driverId}/notification-preferences` : undefined;
    // The switches as last read, so the settings screen does not open without them; the request below says how they stand now.
    const [preferences, setPreferences] = useCachedState<AlertPreferences>(path, undefined, read);
    const [failed, setFailed] = useState<AlertKind | null>(null);

    useEffect(() => {
        if (!driverId) return;
        let alive = true;
        cachedGet(adapter, `drivers/${driverId}/notification-preferences`)
            .then((raw) => {
                if (alive) setPreferences(read(raw));
            })
            // No answer: the switches as last read stay.
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [adapter, driverId, setPreferences]);

    const set = useCallback(
        async (kind: AlertKind, value: boolean) => {
            if (!driverId || !preferences) return;
            const before = preferences;
            setFailed(null);
            // The switch moves at once; it moves back if the server does not take it.
            setPreferences({ ...before, [kind]: value });
            try {
                const answer = await adapter.put(`drivers/${driverId}/notification-preferences`, { [kind]: value });
                const saved = read(answer);
                if (saved) {
                    setPreferences(saved);
                    // What the server now holds is what the screen reopens on.
                    putCache(`drivers/${driverId}/notification-preferences`, undefined, answer);
                }
            } catch {
                setPreferences(before);
                setFailed(kind);
            }
        },
        [adapter, driverId, preferences, setPreferences]
    );

    return { preferences, set, failed };
}

export default useNotificationPreferences;
