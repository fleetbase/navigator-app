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
import { useFleetbase, isQueuedAck } from '../api';

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
    /** Vehicle resource: who holds it now (public id), null when nobody does. */
    driver_id?: string | null;
    /** Set only when the organisation uploaded a real photograph. */
    photo_id?: string | null;
    serial_number?: string | null;
    call_sign?: string | null;
    trim?: string | null;
    type?: string | null;
    body_type?: string | null;
    transmission?: string | null;
    fuel_card_number?: string | null;
    description?: string | null;
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

/**
 * The vehicle's photograph, when it has one.
 *
 * `photo_url` is never empty: with nothing uploaded the server answers with a
 * stock placeholder image (Vehicle::getPhotoUrlAttribute), and `avatar_url` is
 * the map icon, not a picture of the vehicle. A hero made of either would show
 * every van in the fleet as the same grey drawing, so both are refused here.
 */
export function vehiclePhotoOf(vehicle?: { photo_url?: string | null; photo_id?: string | null } | null): string | undefined {
    const url = vehicle?.photo_url;
    if (!url || /vehicle-placeholder/i.test(url)) return undefined;
    // The full resource says outright whether a photo was uploaded; the copy
    // embedded in the driver record does not carry `photo_id`, hence `undefined` passes.
    if (vehicle?.photo_id === null) return undefined;
    return url;
}

/** "Mercedes-Benz · 2022 · diesel · panel van": the line under the name. */
export function vehicleFacts(vehicle?: VehicleRecord | null): string | undefined {
    const words = (value?: string | null) => (value ? value.replace(/[_-]+/g, ' ').trim() : undefined);
    const parts = [[vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || undefined, vehicle?.year ? String(vehicle.year) : undefined, words(vehicle?.fuel_type), words(vehicle?.body_type)].filter(Boolean);
    return parts.length ? parts.join(' · ') : undefined;
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

/**
 * Records an odometer reading against the vehicle.
 *
 * `PUT /v1/vehicles/{id}` now keeps `odometer` (VehicleController's
 * `vehicleInputFromRequest` lists it; the request validates `numeric|min:0`).
 * Earlier servers accepted the field, answered 200 and threw it away, so the
 * answer is read back: a reading the server did not keep is reported as
 * `'ignored'` rather than as saved.
 *
 * Goes through the adapter, so a reading entered without signal is queued and
 * sent later like any other piece of work.
 */
export function useUpdateOdometer(vehicleId?: string) {
    const { adapter } = useFleetbase();
    const [isSaving, setIsSaving] = useState(false);
    const [outcome, setOutcome] = useState<'saved' | 'queued' | 'ignored' | 'failed' | null>(null);

    const save = useCallback(
        async (reading: number): Promise<VehicleRecord | null> => {
            if (!vehicleId || !Number.isFinite(reading) || reading < 0) return null;
            setIsSaving(true);
            setOutcome(null);
            try {
                const raw = await adapter.put(`vehicles/${vehicleId}`, { odometer: reading });
                if (isQueuedAck(raw)) {
                    setOutcome('queued');
                    return null;
                }
                const vehicle = ((raw as { data?: unknown })?.data ?? raw) as VehicleRecord | null;
                const kept = Number(vehicle?.odometer);
                if (!vehicle || !Number.isFinite(kept) || Math.abs(kept - reading) > 0.5) {
                    setOutcome('ignored');
                    return null;
                }
                setOutcome('saved');
                return vehicle;
            } catch {
                setOutcome('failed');
                return null;
            } finally {
                setIsSaving(false);
            }
        },
        [adapter, vehicleId]
    );

    return { save, isSaving, outcome };
}
