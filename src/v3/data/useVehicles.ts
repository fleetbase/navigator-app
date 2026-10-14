/**
 * The vehicles a driver could be assigned — R2 E2.
 *
 * `GET /v1/vehicles` is public and company-scoped by the API's own session, so
 * the list is already the right set; the app filters it down to what can
 * actually be driven rather than asking the server for `available=1`, which
 * does not exist.
 *
 * "Available" is a judgement the app has to make from `status`, and the status
 * vocabulary is long — the create request alone allows active, available,
 * in_use, maintenance, out_of_service, reserved, retired, staging, on_route,
 * idle, cleaning, awaiting_parts, inspection_due, inspection_failed, accident,
 * stolen, operational, decommissioned. Listing what is *blocked* rather than
 * what is allowed is the safer direction: an unrecognised status stays
 * offerable, so a customer's own vocabulary does not silently hide their fleet.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFleetbase } from '../api';
import { normalizeStatus } from '../theme/status';
import type { VehicleRecord } from './useVehicle';

/** Statuses that mean "not this one" — everything else is offerable. */
const UNAVAILABLE = new Set([
    'maintenance',
    'out_of_service',
    'retired',
    'decommissioned',
    'stolen',
    'accident',
    'awaiting_parts',
    'inspection_failed',
]);

export function isAssignable(vehicle?: VehicleRecord | null): boolean {
    if (!vehicle) return false;
    const status = normalizeStatus(vehicle.status);
    return !UNAVAILABLE.has(status);
}

export function useVehicles(reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [vehicles, setVehicles] = useState<VehicleRecord[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<unknown>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const raw = await adapter.get('vehicles', { limit: 100 });
            const rows = (raw as { data?: unknown })?.data ?? raw;
            setVehicles(Array.isArray(rows) ? (rows as VehicleRecord[]) : []);
        } catch (err) {
            setError(err);
        } finally {
            setIsLoading(false);
        }
    }, [adapter]);

    useEffect(() => {
        void load();
    }, [load, reloadToken]);

    return { vehicles, isLoading, error, reload: load };
}
