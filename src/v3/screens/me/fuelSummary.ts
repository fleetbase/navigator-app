/**
 * Fuel figures worked out in the app from the reports it has loaded.
 *
 * The server stores each fill-up and nothing else: there is no month total, no
 * average and no economy field on FuelReport or on the vehicle. Everything
 * here is arithmetic over the driver's own loaded reports (the list asks for
 * the newest 50), so it is "your fill-ups", not the vehicle's whole history —
 * the screens word it that way.
 */
import type { Economy, FuelReportRecord, FuelRow } from '../../data/useFuelReports';

const num = (value: unknown): number | undefined => {
    if (value == null || value === '') return undefined;
    const n = typeof value === 'string' ? Number(value) : (value as number);
    return Number.isFinite(n) ? n : undefined;
};

/** `2026-11`, in the device's own calendar. */
export function monthKey(iso?: string | null): string | undefined {
    if (!iso) return undefined;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export interface MonthSummary {
    key: string;
    /** Any date inside the month, for naming it. */
    date: Date;
    fills: number;
    /** Money spent, in minor units, when every costed fill shares one currency. */
    amount?: number;
    currency?: string;
    /** Volume, when every fill shares one unit. */
    volume?: number;
    volumeUnit?: string;
    /** Total volume over total distance for the fills that have a previous one. */
    economy?: Economy;
    /** Money over volume, in minor units per unit of volume. */
    pricePerUnit?: number;
    /** Oldest first, for the bars. */
    volumes: number[];
}

/**
 * Total fuel over total distance, which is the honest average: the mean of
 * each fill's own figure would let one short top-up outweigh a full tank.
 */
export function averageEconomy(rows: FuelRow[]): Economy | undefined {
    const withEconomy = rows.filter((row) => row.economy);
    if (!withEconomy.length) return undefined;
    const unit = withEconomy[0].economy!.unit;
    // Litres and gallons cannot be averaged together.
    if (withEconomy.some((row) => row.economy!.unit !== unit)) return undefined;
    const distance = withEconomy.reduce((sum, row) => sum + row.economy!.distance, 0);
    const volume = withEconomy.reduce((sum, row) => sum + (num(row.report.volume) ?? 0), 0);
    if (!(distance > 0) || !(volume > 0)) return undefined;
    return unit === 'L/100km' ? { unit, distance, value: (volume / distance) * 100 } : { unit, distance, value: distance / volume };
}

/** The rows of one calendar month, summed. */
export function summariseMonth(rows: FuelRow[], key: string): MonthSummary | undefined {
    const inMonth = rows.filter((row) => monthKey(row.report.created_at) === key);
    if (!inMonth.length) return undefined;

    const reports = inMonth.map((row) => row.report);
    const oldestFirst = [...reports].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));

    const costed = reports.filter((r) => num(r.amount) != null);
    const currencies = new Set(costed.map((r) => (r.currency ?? '').toUpperCase()));
    const oneCurrency = costed.length > 0 && currencies.size === 1;
    const amount = oneCurrency ? costed.reduce((sum, r) => sum + (num(r.amount) ?? 0), 0) : undefined;

    const measured = reports.filter((r) => num(r.volume) != null);
    const units = new Set(measured.map((r) => (r.metric_unit ?? '').trim().toLowerCase()));
    const oneUnit = measured.length > 0 && units.size === 1;
    const volume = oneUnit ? measured.reduce((sum, r) => sum + (num(r.volume) ?? 0), 0) : undefined;

    // Price needs money and volume from the same fills.
    const both = reports.filter((r) => num(r.amount) != null && (num(r.volume) ?? 0) > 0);
    const bothAmount = both.reduce((sum, r) => sum + (num(r.amount) ?? 0), 0);
    const bothVolume = both.reduce((sum, r) => sum + (num(r.volume) ?? 0), 0);

    return {
        key,
        date: new Date(reports[0].created_at ?? Date.now()),
        fills: reports.length,
        amount,
        currency: oneCurrency ? (costed[0].currency ?? undefined) : undefined,
        volume,
        volumeUnit: oneUnit ? (measured[0].metric_unit ?? undefined) : undefined,
        economy: averageEconomy(inMonth),
        pricePerUnit: oneCurrency && oneUnit && bothVolume > 0 ? bothAmount / bothVolume : undefined,
        volumes: oldestFirst.map((r) => num(r.volume) ?? 0),
    };
}

/** Rows from the last `days` days, for "your last 30 days". */
export function recentRows(rows: FuelRow[], days: number, now: number = Date.now()): FuelRow[] {
    const since = now - days * 86400000;
    return rows.filter((row) => {
        const at = row.report.created_at ? new Date(row.report.created_at).getTime() : NaN;
        return Number.isFinite(at) && at >= since;
    });
}

/** The newest report for a vehicle, or the newest of all when none is named. */
export function latestReport(reports?: FuelReportRecord[] | null, vehicleId?: string | null): FuelReportRecord | undefined {
    const list = (reports ?? []).filter((r) => !vehicleId || r.vehicle?.id === vehicleId);
    return [...list].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0];
}

/** "9.8 L/100 km" · "31.2 mpg". */
export function economyLabel(economy?: Economy): string | undefined {
    if (!economy) return undefined;
    return `${economy.value.toFixed(1)} ${economy.unit === 'L/100km' ? 'L/100 km' : 'mpg'}`;
}
