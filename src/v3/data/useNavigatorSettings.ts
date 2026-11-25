/**
 * What the organisation has chosen for its drivers' app (FleetOps → Settings →
 * Navigator App). Read once per session with the driver's token.
 *
 * Every switch defaults to the permissive value, so an older server without the
 * endpoint, or a request that fails, changes nothing a driver sees.
 */
import { useEffect, useState } from 'react';
import { useFleetbase } from '../api';

export interface NavigatorSettings {
    /** Whether drivers see what an order is charged at (its service rate). */
    showServiceRate: boolean;
}

export const DEFAULT_NAVIGATOR_SETTINGS: NavigatorSettings = { showServiceRate: true };

let cached: { key: string; settings: NavigatorSettings } | null = null;

export function useNavigatorSettings(organizationId?: string): NavigatorSettings {
    const { adapter } = useFleetbase();
    const key = organizationId ?? 'current';
    const [settings, setSettings] = useState<NavigatorSettings>(cached?.key === key ? cached.settings : DEFAULT_NAVIGATOR_SETTINGS);

    useEffect(() => {
        if (cached?.key === key) {
            setSettings(cached.settings);
            return;
        }
        let live = true;
        adapter
            .get('navigator/settings')
            .then((raw) => {
                const body = ((raw as { data?: unknown })?.data ?? raw) as { show_service_rate?: unknown };
                const next: NavigatorSettings = { showServiceRate: body?.show_service_rate !== false };
                cached = { key, settings: next };
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
