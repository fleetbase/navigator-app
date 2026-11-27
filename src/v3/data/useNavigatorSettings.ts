/**
 * What the organisation has chosen for its drivers' app (FleetOps → Settings →
 * Navigator App). Read with the driver's token and kept for the session; a
 * screen that opens later asks again when what it holds is more than half a
 * minute old, so a switch turned in the console reaches the app without a
 * restart.
 *
 * What a driver may *see* defaults to the permissive value, so an older server
 * without the endpoint, or a request that fails, changes nothing a driver
 * sees. What a driver may *do* that is normally dispatch's to do (dispatching
 * an order) defaults to off, as it does on the server.
 */
import { useEffect, useState } from 'react';
import { useFleetbase } from '../api';

export interface NavigatorSettings {
    /** Whether drivers see what an order is charged at (its service rate). */
    showServiceRate: boolean;
    /** The organisation's routing distance unit; undefined until the server says. */
    distanceUnit?: 'metric' | 'imperial';
    /** Whether a driver may dispatch an order themselves. Off unless the organisation turned it on. */
    allowDriverDispatch: boolean;
}

export const DEFAULT_NAVIGATOR_SETTINGS: NavigatorSettings = { showServiceRate: true, allowDriverDispatch: false };

/** How long an answer is used before a newly opened screen asks again. */
const FRESH_MS = 30_000;

let cached: { key: string; settings: NavigatorSettings; at: number } | null = null;

export function useNavigatorSettings(organizationId?: string): NavigatorSettings {
    const { adapter } = useFleetbase();
    const key = organizationId ?? 'current';
    const [settings, setSettings] = useState<NavigatorSettings>(cached?.key === key ? cached.settings : DEFAULT_NAVIGATOR_SETTINGS);

    useEffect(() => {
        if (cached?.key === key) {
            setSettings(cached.settings);
            // Recent enough: nothing to ask. Older: shown as it is while the server is asked again.
            if (Date.now() - cached.at < FRESH_MS) return;
        }
        let live = true;
        adapter
            .get('navigator/settings')
            .then((raw) => {
                const body = ((raw as { data?: unknown })?.data ?? raw) as { show_service_rate?: unknown; distance_unit?: unknown; allow_driver_dispatch?: unknown };
                const next: NavigatorSettings = {
                    showServiceRate: body?.show_service_rate !== false,
                    distanceUnit: body?.distance_unit === 'mi' ? 'imperial' : body?.distance_unit === 'km' ? 'metric' : undefined,
                    // Only an explicit yes: a server that does not know the setting does not let a driver dispatch.
                    allowDriverDispatch: body?.allow_driver_dispatch === true,
                };
                cached = { key, settings: next, at: Date.now() };
                if (live) setSettings(next);
            })
            .catch(() => {
                // Older server, or offline: keep the defaults.
            });
        return () => {
            live = false;
        };
    }, [adapter, key]);

    return settings;
}

export default useNavigatorSettings;
