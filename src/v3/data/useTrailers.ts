/**
 * Trailers — FleetOps v0.6.65 made them a first-class resource.
 *
 * What the driver app reads, verified in `routes.php` at v0.6.65:
 *
 *   GET /v1/vehicles/{id}/trailers   trailers currently coupled to a vehicle
 *   GET /v1/trailers/{id}            one trailer, with its current connection
 *
 * A vehicle can tow more than one — a B-double or a road train is a vehicle
 * with ordered connections behind it — and `current_connection.position` is
 * that order, an integer from 1. The list is sorted on it so the app shows
 * the train the way it stands in the yard.
 *
 * Attach and detach (`POST /v1/trailers/{id}/attach|detach`) exist too, but
 * whether a *driver* couples trailers or only reads them is an open product
 * decision (handover §12.1). This hook is the read half; the write half is
 * specified in docs/redesign/09-TRAILERS-SPEC.md and waits on that answer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFleetbase } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';
import { useLiveRefresh } from '../realtime/liveRefresh';

export interface TrailerConnection {
    id?: string;
    position?: number | null;
    connected_at?: string | null;
    disconnected_at?: string | null;
    active?: boolean;
    source?: string | null;
    vehicle?: { id?: string; name?: string | null; plate_number?: string | null } | null;
    notes?: string | null;
}

export interface TrailerRecord {
    id: string;
    asset_class?: 'trailer';
    name?: string | null;
    display_name?: string | null;
    code?: string | null;
    description?: string | null;
    type?: string | null;
    body_type?: string | null;
    status?: string | null;
    attachment_state?: string | null;
    connectivity_status?: string | null;
    online?: boolean | null;
    vin?: string | null;
    plate_number?: string | null;
    serial_number?: string | null;
    make?: string | null;
    model?: string | null;
    year?: string | number | null;
    color?: string | null;
    photo_url?: string | null;
    vehicle_id?: string | null;
    current_vehicle_name?: string | null;
    attached_at?: string | null;
    current_connection?: TrailerConnection | null;
    measurement_system?: string | null;
    length?: number | string | null;
    width?: number | string | null;
    height?: number | string | null;
    tare_weight?: number | string | null;
    gvwr?: number | string | null;
    payload_capacity?: number | string | null;
    cargo_volume?: number | string | null;
    axle_count?: number | null;
    tire_count?: number | null;
    door_count?: number | null;
    coupling_type?: string | null;
    brake_type?: string | null;
    abs_equipped?: boolean | null;
    ebs_equipped?: boolean | null;
    refrigerated?: boolean | null;
    temperature_min?: number | string | null;
    temperature_max?: number | string | null;
    reefer_engine_hours?: number | string | null;
    odometer?: number | string | null;
    odometer_unit?: string | null;
    engine_hours?: number | string | null;
    last_online_at?: string | null;
    speed?: number | null;
    heading?: number | null;
    location?: { type?: string; coordinates?: number[] } | null;
    [key: string]: unknown;
}

export type TrailerLoadState = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

function unwrap(raw: unknown): unknown {
    return (raw as { data?: unknown })?.data ?? raw;
}

/** "T-204 · Fridge box" — code first, since that is what is painted on the side. */
export function trailerTitle(trailer?: TrailerRecord | null): string | undefined {
    if (!trailer) return undefined;
    return trailer.display_name ?? trailer.name ?? trailer.code ?? undefined;
}

/** Position in the train, 1-based; undefined when the connection does not say. */
export function trainPositionOf(trailer?: TrailerRecord | null): number | undefined {
    const p = Number(trailer?.current_connection?.position);
    return Number.isFinite(p) && p >= 1 ? p : undefined;
}

/** "2–8 °C" when the trailer is refrigerated and either bound is set. */
export function reeferRangeOf(trailer?: TrailerRecord | null): string | undefined {
    if (!trailer?.refrigerated) return undefined;
    const min = trailer.temperature_min;
    const max = trailer.temperature_max;
    if (min == null && max == null) return undefined;
    if (min != null && max != null) return `${min}–${max} °C`;
    return `${min ?? max} °C`;
}

/** Position first, then name — the order the train stands in. */
export function sortByPosition(trailers: TrailerRecord[]): TrailerRecord[] {
    return [...trailers].sort((a, b) => {
        const pa = trainPositionOf(a) ?? Number.MAX_SAFE_INTEGER;
        const pb = trainPositionOf(b) ?? Number.MAX_SAFE_INTEGER;
        if (pa !== pb) return pa - pb;
        return String(trailerTitle(a) ?? '').localeCompare(String(trailerTitle(b) ?? ''));
    });
}

export function useVehicleTrailers(vehicleId?: string | null, reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [trailers, setTrailers] = useState<TrailerRecord[] | null>(null);
    const [state, setState] = useState<TrailerLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);

    const load = useCallback(
        async (mode: 'loading' | 'refreshing' = 'loading') => {
            if (!vehicleId || inFlight.current) return;
            inFlight.current = true;
            setState(mode);
            setError(null);
            try {
                const body = unwrap(await adapter.get(`vehicles/${vehicleId}/trailers`));
                // Anything but a list is not a trailer list, whatever answered.
                setTrailers(sortByPosition(Array.isArray(body) ? (body as TrailerRecord[]) : []));
                setState('ready');
            } catch (err) {
                setError(err as ApiError);
                setState('error');
            } finally {
                inFlight.current = false;
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [adapter, vehicleId, reloadToken]
    );

    const revision = useLiveRefresh();
    useEffect(() => {
        void load(trailers ? 'refreshing' : 'loading');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, revision]);

    return {
        trailers: trailers ?? [],
        state,
        error,
        isLoading: state === 'loading' && !trailers,
        failed: state === 'error',
        retry: useCallback(() => load('loading'), [load]),
    };
}

export function useTrailer(trailerId?: string | null, seed?: TrailerRecord | null) {
    const { adapter } = useFleetbase();
    const [trailer, setTrailer] = useState<TrailerRecord | null>(seed ?? null);
    const [state, setState] = useState<TrailerLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);

    const load = useCallback(async () => {
        if (!trailerId) return;
        setState(trailer ? 'refreshing' : 'loading');
        setError(null);
        try {
            const body = unwrap(await adapter.get(`trailers/${trailerId}`)) as TrailerRecord;
            if (body?.id) setTrailer(body);
            setState('ready');
        } catch (err) {
            setError(err as ApiError);
            setState('error');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adapter, trailerId]);

    useEffect(() => {
        void load();
    }, [load]);

    return { trailer, state, error, isLoading: state === 'loading' && !trailer, failed: state === 'error', retry: load };
}
