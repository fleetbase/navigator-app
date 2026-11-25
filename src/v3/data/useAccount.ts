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
import { useFleetbase, isQueuedAck } from '../api';
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
    /** Carried by the driver's embedded vehicle on the live API; seeds the odometer prompt. */
    odometer?: number | string | null;
    status?: string | null;
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
    /** From the linked user; the Driver resource reads it through. */
    timezone?: string | null;
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
export function vehicleDescription(vehicle?: Pick<VehicleSummary, 'make' | 'model' | 'year'> | null): string | undefined {
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

export interface DriverProfileDraft {
    name?: string;
    email?: string;
    phone?: string;
    city?: string;
    country?: string;
    /**
     * Vehicle **public id**, not uuid — `DriverController@update` resolves it
     * against `vehicles.public_id` scoped to the session's company, so a driver
     * can only ever be assigned a vehicle in their own organisation.
     *
     * Carried on the same draft as the profile fields because it is the same
     * request: there is no `assign-vehicle` on the public namespace, and there
     * does not need to be.
     */
    vehicle?: string;
}

/**
 * Updates the driver's own details.
 *
 * `PUT /v1/drivers/{id}` splits the payload: `name`, `email`, `phone` and
 * `password` are written to the **user** record, everything else to the driver
 * (DriverController@update). Nothing is required on an update, so only the
 * fields that actually changed are sent.
 *
 * **`password` is deliberately never sent from here.** The endpoint accepts it
 * and sets it without asking for the current one, so offering a change in the
 * app would let anyone holding an unlocked handset take the account. That needs
 * a current-password check server-side first — see the register.
 *
 * Queueable: a name corrected in a tunnel and replayed on reconnect is still
 * what the driver meant. Contrast the session-changing calls, which the adapter
 * refuses to queue.
 */
export function useUpdateDriver(driverId?: string) {
    const { adapter } = useFleetbase();
    const [isSaving, setIsSaving] = useState(false);
    const [queued, setQueued] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = useCallback(
        async (changes: DriverProfileDraft): Promise<DriverRecord | null> => {
            if (!driverId) return null;
            const body: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(changes)) {
                if (typeof value === 'string' && value.trim()) body[key] = value.trim();
            }
            if (Object.keys(body).length === 0) return null;

            setIsSaving(true);
            setError(null);
            try {
                const raw = await adapter.put(`drivers/${driverId}`, body);
                if (isQueuedAck(raw)) {
                    setQueued(true);
                    return null;
                }
                return (((raw as { data?: unknown })?.data ?? raw) ?? null) as DriverRecord | null;
            } catch (err) {
                setError((err as Error).message);
                return null;
            } finally {
                setIsSaving(false);
            }
        },
        [adapter, driverId]
    );

    return { save, isSaving, queued, error, clearError: useCallback(() => setError(null), []) };
}

/**
 * What the organisation asks of a driver it has just taken on.
 *
 * `GET /v1/onboard/driver-onboard-settings/{company}` answers a driver token as
 * well as the platform one (routes.php, the `fleetbase.api-or-platform` group).
 * The only part the account area can act on is the list of documents: a driver
 * who signed up with a join code is held at `status: pending` until the
 * organisation has seen them (DriverOnboardController@create).
 */
export interface OnboardingSummary {
    documents_required?: boolean;
    documents?: string[];
    self_sign_up?: boolean;
    invite_only?: boolean;
}

export function useOnboardingSummary(organizationId?: string | null, enabled = true) {
    const { adapter } = useFleetbase();
    const [summary, setSummary] = useState<OnboardingSummary | null>(null);

    useEffect(() => {
        if (!organizationId || !enabled) return;
        let alive = true;
        adapter
            .get(`onboard/driver-onboard-settings/${organizationId}`)
            .then((raw) => {
                const body = ((raw as { data?: unknown })?.data ?? raw) as { onboarding?: OnboardingSummary } | null;
                if (alive) setSummary(body?.onboarding ?? null);
            })
            // Supporting detail: without it the notice is simply not shown.
            .catch(() => {
                if (alive) setSummary(null);
            });
        return () => {
            alive = false;
        };
    }, [adapter, organizationId, enabled]);

    return summary;
}

/**
 * Sets the driver's photo.
 *
 * `PUT /v1/drivers/{id}` takes `photo` as a base64 data URI, stores the file
 * and points the linked user's avatar at it (DriverController@update).
 *
 * The screen offers this only with a connection: the picture is megabytes of
 * base64, and a profile photo is not worth holding that in the offline queue
 * for. If signal drops mid-request the adapter still queues it, which is why
 * `'queued'` is a possible answer.
 */
export function useUpdateDriverPhoto(driverId?: string) {
    const { adapter } = useFleetbase();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const savePhoto = useCallback(
        async (base64: string): Promise<DriverRecord | 'queued' | null> => {
            if (!driverId || !base64) return null;
            setIsSaving(true);
            setError(null);
            try {
                const raw = await adapter.put(`drivers/${driverId}`, { photo: `data:image/jpeg;base64,${base64}` });
                if (isQueuedAck(raw)) return 'queued';
                return (((raw as { data?: unknown })?.data ?? raw) ?? null) as DriverRecord | null;
            } catch (err) {
                setError((err as Error).message);
                return null;
            } finally {
                setIsSaving(false);
            }
        },
        [adapter, driverId]
    );

    return { savePhoto, isSaving, error };
}

/**
 * Changes the driver's password, proving the current one.
 *
 * `POST /v1/drivers/{id}/change-password` (DriverController@changePassword)
 * checks `current_password`, sets `password` (8 characters or more), signs every
 * other device out and answers with a **new token** for this one. The caller
 * has to hand that token to whoever owns the session, or the very next request
 * would be made with a token the server has just deleted.
 */
export function useChangePassword(driverId?: string) {
    const { adapter } = useFleetbase();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const change = useCallback(
        async (currentPassword: string, password: string): Promise<string | null> => {
            if (!driverId) return null;
            setIsSaving(true);
            setError(null);
            try {
                const raw = await adapter.post(`drivers/${driverId}/change-password`, { current_password: currentPassword, password, password_confirmation: password });
                const body = ((raw as { data?: unknown })?.data ?? raw) as { token?: string } | null;
                if (!body?.token) {
                    setError('no-token');
                    return null;
                }
                return body.token;
            } catch (err) {
                setError((err as Error).message);
                return null;
            } finally {
                setIsSaving(false);
            }
        },
        [adapter, driverId]
    );

    return { change, isSaving, error, clearError: useCallback(() => setError(null), []) };
}
