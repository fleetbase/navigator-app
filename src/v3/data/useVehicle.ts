/**
 * The driver's assigned vehicle — R2 E1, read-only.
 *
 * `GET /v1/vehicles/{id}` is public, so viewing the vehicle was never blocked;
 * what the ledger had blocked was *changing* it and posting an odometer, which
 * still need `assign-vehicle` and an odometer endpoint on the public namespace.
 *
 * The resource returns around a hundred fields and a stock instance has most of
 * them null — engine displacement, torque RPM, GCWR, lease expiry. Rendering
 * that verbatim buries the six things a driver actually needs behind ninety
 * blanks, so the screen asks for named facts and drops whatever is absent.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFleetbase } from '../api';

export interface VehicleRecord {
    id: string;
    name?: string | null;
    internal_id?: string | null;
    plate_number?: string | null;
    vin?: string | null;
    make?: string | null;
    model?: string | null;
    year?: string | number | null;
    color?: string | null;
    status?: string | null;
    online?: boolean;
    photo_url?: string | null;
    avatar_url?: string | null;
    odometer?: number | string | null;
    odometer_unit?: string | null;
    fuel_type?: string | null;
    fuel_capacity?: number | string | null;
    fuel_volume_unit?: string | null;
    seating_capacity?: number | string | null;
    payload_capacity?: number | string | null;
    telematics?: {
        last_event_at?: string | null;
        last_provider?: string | null;
        last_telemetry_data?: { odometer?: number | null; speed?: number | null; ignition?: boolean | null } | null;
    } | null;
}

/**
 * The odometer, and **where it came from**.
 *
 * A vehicle's own `odometer` column is frequently null while a telematics box
 * is reporting one every few minutes. Showing the telemetry reading is right —
 * it is the true number — but showing it as though someone had entered it is
 * not: a driver about to log a fuel fill needs to know whether the figure is a
 * live feed or a stale manual entry, because only one of them is worth copying.
 */
export function odometerOf(vehicle?: VehicleRecord | null): { value: number; source: 'recorded' | 'telematics' } | undefined {
    const own = Number(vehicle?.odometer);
    if (vehicle?.odometer != null && Number.isFinite(own)) return { value: own, source: 'recorded' };

    const telemetry = Number(vehicle?.telematics?.last_telemetry_data?.odometer);
    if (Number.isFinite(telemetry)) return { value: telemetry, source: 'telematics' };

    return undefined;
}

/** "Toyota HiAce 2025", from whichever parts the record actually carries. */
export function vehicleTitle(vehicle?: VehicleRecord | null): string | undefined {
    const parts = [vehicle?.make, vehicle?.model, vehicle?.year].filter(Boolean).map(String);
    return parts.length ? parts.join(' ') : undefined;
}

export function useVehicle(vehicleId?: string, seed?: VehicleRecord | null, reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [vehicle, setVehicle] = useState<VehicleRecord | null>(seed ?? null);
    const [isLoading, setIsLoading] = useState(!seed);
    const [error, setError] = useState<unknown>(null);

    const load = useCallback(async () => {
        if (!vehicleId) {
            setIsLoading(false);
            return;
        }
        setError(null);
        try {
            const result = await adapter.get(`vehicles/${vehicleId}`);
            const data = (result as { data?: unknown })?.data ?? result;
            setVehicle(data as VehicleRecord);
        } catch (err) {
            setError(err);
        } finally {
            setIsLoading(false);
        }
    }, [adapter, vehicleId]);

    useEffect(() => {
        void load();
    }, [load, reloadToken]);

    return { vehicle, isLoading, error, reload: load };
}
