/**
 * Fuel reports — R1 frame s09, R2 frame F2.
 *
 * Scoping matters more than usual here. `GET /v1/fuel-reports` accepts
 * **`driver=<public id>`**; `driver_uuid` and `driver_assigned` are *ignored*
 * and silently return every driver's reports in the company. Getting that wrong
 * shows one driver another's fuel spend, so the query is built in one place and
 * the parameter name is asserted in a test.
 *
 * What the public resource actually carries (Http/Resources/v1/FuelReport):
 * odometer, amount, currency, volume, metric_unit, type, status, location,
 * vehicle, driver, timestamps, and from FleetOps 0.7.4 what the driver wrote at
 * the pump: `station`, `fuel_type`, `note` and the receipt `files`. `meta`,
 * `source`, `provider` and `fuel_provider_transaction_uuid` are all wrapped in
 * `isInternalRequest()`, so the driver-facing API cannot read them — see
 * FuelLogScreen for what that costs the design.
 *
 * An older server ignores the three new fields on create and returns none of
 * them, so everything that reads them treats them as optional.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFleetbase, isQueuedAck } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';
import { formatNumber, type DistanceUnit } from '../format';

export interface FuelReportRecord {
    id: string;
    status?: string;
    type?: string | null;
    odometer?: string | number | null;
    volume?: string | number | null;
    metric_unit?: string | null;
    amount?: string | number | null;
    currency?: string | null;
    location?: { type?: string; coordinates?: number[] } | null;
    vehicle?: { id?: string; name?: string } | null;
    driver?: { id?: string; name?: string } | string | null;
    /** Where the driver filled up, in their own words. */
    station?: string | null;
    /** What went in the tank, in their own words. */
    fuel_type?: string | null;
    note?: string | null;
    /** The receipt photos. */
    files?: FuelReportFile[] | null;
    created_at?: string;
    updated_at?: string;
}

export interface FuelReportFile {
    id: string;
    url?: string | null;
    original_filename?: string | null;
    content_type?: string | null;
}

export type FuelLoadState = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

const num = (v: unknown): number | undefined => {
    if (v == null || v === '') return undefined;
    const n = typeof v === 'string' ? Number(v) : (v as number);
    return Number.isFinite(n) ? n : undefined;
};

/** Litres, however the instance spelled the unit. */
function isLitres(unit?: string | null): boolean {
    return typeof unit === 'string' && /^(l|ltr|litre|liter|litres|liters)$/i.test(unit.trim());
}

export interface Economy {
    /** L/100km for metric records, MPG for gallons. */
    value: number;
    unit: 'L/100km' | 'mpg';
    /** Distance covered since the previous fill, in the odometer's own units. */
    distance: number;
}

/**
 * Economy is derived, not stored — there is no field for it. It needs the
 * *previous* fill on the same vehicle, so the first report of any vehicle
 * legitimately has none, and the screen says so rather than showing a zero.
 *
 * The odometer carries no unit of its own, so it is read as km beside litres and
 * as miles beside gallons. Anything else returns undefined rather than guessing.
 */
export function computeEconomy(previous?: FuelReportRecord | null, current?: FuelReportRecord | null): Economy | undefined {
    if (!previous || !current) return undefined;
    const from = num(previous.odometer);
    const to = num(current.odometer);
    const volume = num(current.volume);
    if (from == null || to == null || volume == null || volume <= 0) return undefined;

    const distance = to - from;
    // A non-advancing odometer means a correction or a re-entry, not 0 economy.
    if (!(distance > 0)) return undefined;

    if (isLitres(current.metric_unit)) {
        return { value: (volume / distance) * 100, unit: 'L/100km', distance };
    }
    if (typeof current.metric_unit === 'string' && /^(gal|gallon|gallons)$/i.test(current.metric_unit.trim())) {
        return { value: distance / volume, unit: 'mpg', distance };
    }
    return undefined;
}

export interface FuelRow {
    report: FuelReportRecord;
    economy?: Economy;
    /** The fill this one is measured against, so detail can show it too. */
    previous?: FuelReportRecord;
}

/** Newest first for display; economy needs the pair either side of each row. */
export function withEconomy(reports: FuelReportRecord[]): FuelRow[] {
    const byVehicle = new Map<string, FuelReportRecord[]>();
    for (const r of reports) {
        const key = r.vehicle?.id ?? r.vehicle?.name ?? '—';
        const list = byVehicle.get(key) ?? [];
        list.push(r);
        byVehicle.set(key, list);
    }

    const economyFor = new Map<string, Economy | undefined>();
    const previousFor = new Map<string, FuelReportRecord | undefined>();
    for (const list of byVehicle.values()) {
        // Ascending odometer within a vehicle, so "previous fill" is meaningful.
        const ordered = [...list].sort((a, b) => (num(a.odometer) ?? 0) - (num(b.odometer) ?? 0));
        ordered.forEach((r, i) => {
            economyFor.set(r.id, computeEconomy(ordered[i - 1], r));
            previousFor.set(r.id, ordered[i - 1]);
        });
    }

    return reports.map((report) => ({
        report,
        economy: economyFor.get(report.id),
        previous: previousFor.get(report.id),
    }));
}

export function formatEconomy(economy?: Economy): string | undefined {
    if (!economy) return undefined;
    return `${economy.value.toFixed(1)} ${economy.unit}`;
}

/** Volume as the record spelled it — "38.5 L". */
export function formatVolume(report?: FuelReportRecord | null): string {
    const v = num(report?.volume);
    if (v == null) return '—';
    return report?.metric_unit ? `${v} ${report.metric_unit}` : String(v);
}

export function formatOdometer(report?: FuelReportRecord | null, units: DistanceUnit = 'metric'): string {
    const v = num(report?.odometer);
    if (v == null) return '—';
    return `${formatNumber(v)} ${units === 'imperial' ? 'mi' : 'km'}`;
}

/**
 * `reloadToken` refetches when it changes. The screen cannot ask navigation
 * whether it is focused without dragging a NavigationContainer into its tests,
 * so the navigator owns that question and passes the answer down: log a fill,
 * come back, and the new row is there rather than the list being a snapshot
 * from whenever the tab was first opened.
 */
export function useFuelReports(driverId?: string, reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [reports, setReports] = useState<FuelReportRecord[] | null>(null);
    const [state, setState] = useState<FuelLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);

    const load = useCallback(
        async (mode: 'loading' | 'refreshing' = 'loading') => {
            if (!driverId || inFlight.current) return;
            inFlight.current = true;
            setState(mode);
            setError(null);
            try {
                // `driver`, never `driver_uuid` — see the note at the top.
                const raw = (await adapter.get('fuel-reports', { driver: driverId, sort: '-created_at', limit: 50 })) as unknown;
                const rows = Array.isArray(raw) ? raw : ((raw as { data?: unknown[] })?.data ?? []);
                setReports(
                    [...(rows as FuelReportRecord[])].sort((a, b) =>
                        String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
                    )
                );
                setState('ready');
            } catch (err) {
                setError(err as ApiError);
                setState('error');
            } finally {
                inFlight.current = false;
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [adapter, driverId, reloadToken]
    );

    useEffect(() => {
        void load(reports ? 'refreshing' : 'loading');
        // `load` already closes over reloadToken; reports is read, not tracked.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    const rows = useMemo(() => (reports ? withEconomy(reports) : []), [reports]);

    return {
        reports,
        rows,
        state,
        error,
        isLoading: state === 'loading' && !reports,
        isRefreshing: state === 'refreshing',
        failed: state === 'error',
        refresh: useCallback(() => load('refreshing'), [load]),
        retry: useCallback(() => load('loading'), [load]),
    };
}

export interface NewFuelReport {
    odometer: string;
    volume: string;
    metricUnit: string;
    amount?: string;
    currency?: string;
    location?: { type: 'Point'; coordinates: [number, number] } | null;
    station?: string;
    fuelType?: string;
    note?: string;
}

/**
 * Creates a report. Goes through the adapter, so losing signal at a pump queues
 * it with its idempotency key rather than failing.
 *
 * `amount` is sent in **minor units** — the API stores and returns money that
 * way ("7325" SGD is $73.25), so the driver's "73.25" is multiplied here rather
 * than being written a hundredfold too small.
 */
export function useCreateFuelReport(driverId?: string) {
    const { adapter } = useFleetbase();
    const [isSaving, setIsSaving] = useState(false);
    const [queued, setQueued] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const create = useCallback(
        async (draft: NewFuelReport): Promise<FuelReportRecord | null> => {
            if (!driverId) {
                setError('missing-driver');
                return null;
            }
            setIsSaving(true);
            setError(null);
            try {
                const body: Record<string, unknown> = {
                    driver: driverId,
                    odometer: draft.odometer,
                    volume: draft.volume,
                    metric_unit: draft.metricUnit,
                    status: 'draft',
                };
                const major = num(draft.amount);
                if (major != null) {
                    body.amount = String(Math.round(major * 100));
                    body.currency = draft.currency ?? 'USD';
                }
                if (draft.location) body.location = draft.location;
                if (draft.station?.trim()) body.station = draft.station.trim();
                if (draft.fuelType?.trim()) body.fuel_type = draft.fuelType.trim();
                if (draft.note?.trim()) body.note = draft.note.trim();

                const result = await adapter.post('fuel-reports', body);
                if (isQueuedAck(result)) {
                    setQueued(true);
                    return null;
                }
                return ((result as { data?: unknown })?.data ?? result) as FuelReportRecord;
            } catch (err) {
                setError((err as Error).message);
                return null;
            } finally {
                setIsSaving(false);
            }
        },
        [adapter, driverId]
    );

    return { create, isSaving, queued, error };
}

/**
 * One report, read on its own.
 *
 * The list is cached on the server and a receipt uploaded a moment ago does not
 * clear that cache, so the row a detail screen is opened with can be missing a
 * photo the driver just took. Reading the report itself is never stale. The row
 * is shown meanwhile, and stays if the read fails.
 */
export function useFuelReport(id?: string, seed?: FuelReportRecord | null) {
    const { adapter } = useFleetbase();
    const [report, setReport] = useState<FuelReportRecord | null>(seed ?? null);

    useEffect(() => {
        if (!id) return;
        let live = true;
        (async () => {
            try {
                const raw = (await adapter.get(`fuel-reports/${id}`)) as unknown;
                const body = ((raw as { data?: unknown })?.data ?? raw) as FuelReportRecord | null;
                if (live && body && typeof body === 'object' && body.id) setReport(body);
            } catch {
                // The row passed in is still true; it only lacks what the list did not carry.
            }
        })();
        return () => {
            live = false;
        };
    }, [adapter, id]);

    return report ?? seed ?? null;
}

/**
 * Attaches receipt photos to a report that already exists.
 *
 * The same route an issue's photos take: `POST /v1/files/base64` with the
 * report as the file's subject, which is the relation the report's `files`
 * reads. The subject type is spelled `fleet-ops:fuel_report`, underscore and
 * all: the server turns the part after the colon straight into a table name,
 * and `fuel-report` names a table that does not exist.
 *
 * Needs the report's id, so it cannot run for a fill-up that was queued
 * offline. Returns how many did not upload.
 */
export function useAttachFuelReceipts() {
    const { adapter } = useFleetbase();
    const [isUploading, setIsUploading] = useState(false);

    const attach = useCallback(
        async (reportId: string, photos: string[]): Promise<number> => {
            if (!reportId || !photos.length) return 0;
            setIsUploading(true);
            let failed = 0;
            try {
                for (let i = 0; i < photos.length; i += 1) {
                    try {
                        const result = await adapter.post('files/base64', {
                            data: photos[i],
                            file_name: `fuel-receipt-${reportId}-${i + 1}.jpg`,
                            file_type: 'image',
                            content_type: 'image/jpeg',
                            subject_type: 'fleet-ops:fuel_report',
                            subject_id: reportId,
                        });
                        if (isQueuedAck(result) || !((result as { data?: { id?: string } })?.data ?? (result as { id?: string }))?.id) failed += 1;
                    } catch {
                        failed += 1;
                    }
                }
            } finally {
                setIsUploading(false);
            }
            return failed;
        },
        [adapter]
    );

    return { attach, isUploading };
}
