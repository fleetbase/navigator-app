/**
 * The driver's own record and their organisation.
 *
 * Endpoint note worth keeping: `GET /v1/organizations` requires a **platform**
 * API token and 401s for a driver. The two a driver token *can* read are
 * `organizations/current` and `drivers/{id}/organizations` — which is also what
 * unblocks the org switcher, since the obvious-looking endpoint is the one that
 * does not work.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFleetbase } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';

export interface VehicleSummary {
    id?: string;
    name?: string;
    internal_id?: string | null;
    photo_url?: string | null;
    plate_number?: string | null;
    make?: string | null;
    model?: string | null;
    year?: string | number | null;
}

export interface DriverRecord {
    id: string;
    user?: string;
    name?: string;
    email?: string;
    phone?: string | null;
    internal_id?: string | null;
    status?: string | null;
    online?: boolean;
    drivers_license_number?: string | null;
    license_expiry?: string | null;
    photo_url?: string | null;
    avatar_url?: string | null;
    company?: string;
    company_name?: string;
    vehicle?: VehicleSummary | string | null;
    city?: string | null;
    country?: string | null;
    currency?: string | null;
}

export interface OrganizationRecord {
    id: string;
    name?: string;
    logo_url?: string | null;
    currency?: string | null;
    timezone?: string | null;
    country?: string | null;
}

/** `vehicle` is an object on the driver resource, a name string elsewhere. */
export function vehicleOf(driver?: DriverRecord | null): VehicleSummary | undefined {
    const v = driver?.vehicle;
    if (!v) return undefined;
    if (typeof v === 'string') return { name: v };
    return v;
}

/** "Toyota Hiace 2021", from whichever of those the record actually has. */
export function vehicleDescription(vehicle?: VehicleSummary): string | undefined {
    const parts = [vehicle?.make, vehicle?.model, vehicle?.year].filter(Boolean).map(String);
    return parts.length ? parts.join(' ') : undefined;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function useDriver(driverId?: string, seed?: DriverRecord | null, reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [driver, setDriver] = useState<DriverRecord | null>(seed ?? null);
    const [state, setState] = useState<LoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);

    const load = useCallback(async () => {
        if (!driverId || inFlight.current) return;
        inFlight.current = true;
        setState('loading');
        setError(null);
        try {
            const raw = await adapter.get(`drivers/${driverId}`);
            setDriver((((raw as { data?: unknown })?.data ?? raw) ?? null) as DriverRecord | null);
            setState('ready');
        } catch (err) {
            setError(err as ApiError);
            setState('error');
        } finally {
            inFlight.current = false;
        }
    }, [adapter, driverId]);

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, reloadToken]);

    return {
        driver,
        state,
        error,
        isLoading: state === 'loading' && !driver,
        // A cached record is enough to render the screen; only a cold failure blocks.
        isBlocked: state === 'error' && !driver,
        retry: load,
    };
}

export function useCurrentOrganization(reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [organization, setOrganization] = useState<OrganizationRecord | null>(null);
    const [state, setState] = useState<LoadState>('idle');

    const load = useCallback(async () => {
        setState('loading');
        try {
            const raw = await adapter.get('organizations/current');
            setOrganization((((raw as { data?: unknown })?.data ?? raw) ?? null) as OrganizationRecord | null);
            setState('ready');
        } catch {
            // Supporting detail: the header already names the organisation, so a
            // failure here must not take the account screen down.
            setOrganization(null);
            setState('error');
        }
    }, [adapter]);

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, reloadToken]);

    return { organization, isLoading: state === 'loading', failed: state === 'error', retry: load };
}

/**
 * The organisations this driver belongs to.
 *
 * `GET /v1/organizations` is the wrong endpoint here — it needs a **platform**
 * token and 401s for a driver. This one is driver-scoped and works with the
 * Sanctum token.
 */
export function useDriverOrganizations(driverId?: string, reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [organizations, setOrganizations] = useState<OrganizationRecord[] | null>(null);
    const [state, setState] = useState<LoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);

    const load = useCallback(async () => {
        if (!driverId) return;
        setState('loading');
        setError(null);
        try {
            const raw = (await adapter.get(`drivers/${driverId}/organizations`)) as unknown;
            const rows = Array.isArray(raw) ? raw : ((raw as { data?: unknown[] })?.data ?? []);
            setOrganizations(rows as OrganizationRecord[]);
            setState('ready');
        } catch (err) {
            setError(err as ApiError);
            setState('error');
        }
    }, [adapter, driverId]);

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, reloadToken]);

    return {
        organizations,
        state,
        error,
        isLoading: state === 'loading' && !organizations,
        failed: state === 'error',
        retry: load,
    };
}

/**
 * Switching organisation returns a **new driver, with a new token** — the
 * session is replaced, not amended. This hook performs the request and hands the
 * driver back; creating the session stays with the host app, which owns auth.
 *
 * Written here rather than reusing v2's `switchOrganization` because that one
 * swallows every failure into a `console.warn`, so the screen could never tell
 * the driver it had not worked.
 */
export function useSwitchOrganization(driverId?: string) {
    const { adapter } = useFleetbase();
    const [switchingTo, setSwitchingTo] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const switchTo = useCallback(
        async (organizationId: string): Promise<DriverRecord | null> => {
            if (!driverId) return null;
            setSwitchingTo(organizationId);
            setError(null);
            try {
                // `next`, not `organization` — the API 422s on anything else.
                const raw = await adapter.post(`drivers/${driverId}/switch-organization`, { next: organizationId });
                const body = ((raw as { data?: unknown })?.data ?? raw) as { driver?: DriverRecord } | DriverRecord;
                const driver = (body as { driver?: DriverRecord }).driver ?? (body as DriverRecord);
                return driver && (driver as DriverRecord).id ? (driver as DriverRecord) : null;
            } catch (err) {
                setError((err as Error).message);
                return null;
            } finally {
                setSwitchingTo(null);
            }
        },
        [adapter, driverId]
    );

    return { switchTo, switchingTo, error, clearError: useCallback(() => setError(null), []) };
}
