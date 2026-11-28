/**
 * The driver's day as the server counted it: `GET /v1/drivers/{id}/day-summary`.
 *
 * The home screen can work most of a day out from what it has loaded, but not
 * all of it: how long the driver has been on duty and how far they actually
 * drove are only known to the server, and its counts are the ones dispatch
 * sees. A server older than FleetOps 0.7.4 has no such route and answers 404;
 * that is not an error to show anyone, the screen keeps its own figures.
 *
 * What the figures mean (Support/DriverDaySummary on the server):
 *   - `waypoints`: the day's manifest waypoints, plus the waypoints of orders
 *     completed that day that are on no manifest.
 *   - `planned_distance_m`: the routes' planned length, not what was driven.
 *   - `distance_driven_m`: straight lines between the positions the app
 *     reported; null when there were too few to measure.
 *   - `seconds_on_duty`: null when the server recorded no time on duty that day.
 *   - `cash_on_delivery_due`: what completed orders asked for in cash, in minor
 *     units. Nothing records the cash being handed over, hence "due".
 */
import { useCallback, useEffect, useRef } from 'react';
import { useFleetbase } from '../api';
import { cachedGet, useCachedState } from './responseCache';

export interface DaySummaryCash {
    currency?: string | null;
    /** Minor units. */
    amount: number;
    orders: number;
}

export interface DaySummary {
    driver?: string;
    /** YYYY-MM-DD in `timezone`. */
    date: string;
    timezone?: string;
    from?: string;
    to?: string;
    online?: boolean;
    online_since?: string | null;
    seconds_on_duty?: number | null;
    waypoints?: { completed: number; skipped: number; total: number };
    orders_completed?: number;
    planned_distance_m?: number | null;
    distance_driven_m?: number | null;
    cash_on_delivery_due?: DaySummaryCash[];
    first_activity_at?: string | null;
    last_activity_at?: string | null;
}

/**
 * Seconds on duty right now. The server's figure is from when it was asked; a
 * driver still on duty has been on duty for longer since, so the time since the
 * answer arrived is added while they are.
 */
export function secondsOnDuty(summary?: DaySummary | null, fetchedAt?: number, now: number = Date.now()): number | undefined {
    const seconds = summary?.seconds_on_duty;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return undefined;
    if (!summary?.online || !fetchedAt || now <= fetchedAt) return Math.round(seconds);
    return Math.round(seconds + (now - fetchedAt) / 1000);
}

/** The phone's own timezone name, when the runtime can say. */
function deviceTimezone(): string | undefined {
    try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return typeof zone === 'string' && zone.includes('/') ? zone : undefined;
    } catch {
        return undefined;
    }
}

/**
 * `date` is the day as the phone sees it (YYYY-MM-DD) and is sent with the
 * phone's timezone, so the server cuts the same day the driver is living in
 * rather than the one a profile field implies.
 *
 * `reloadKey` refetches when it changes: a pull to refresh, going on or off duty.
 */
/** Anything that is not a summary (a queued ack, an older server's error body) is no answer. */
function summaryOf(raw: unknown): DaySummary | undefined {
    const body = ((raw as { data?: unknown })?.data ?? raw) as DaySummary | null;
    return body && typeof body === 'object' && typeof body.date === 'string' ? body : undefined;
}

/*
 * A kept summary opens the home screen with the day's figures while the
 * server is asked again. Its time on duty is carried forward from when it
 * arrived (see `secondsOnDuty`), so one from much earlier in the day is not
 * shown: the driver may have gone off duty since, and the figure would run on.
 */
const DAY_SUMMARY_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function useDaySummary(driverId?: string, reloadKey: string | number = 0, date?: string) {
    const { adapter } = useFleetbase();
    const timezone = deviceTimezone();
    const params = date && timezone ? { date, timezone } : undefined;
    const [kept, setKept] = useCachedState<{ summary: DaySummary; fetchedAt: number }>(
        driverId ? `drivers/${driverId}/day-summary` : undefined,
        params,
        (raw, at) => {
            const summary = summaryOf(raw);
            return summary ? { summary, fetchedAt: at } : undefined;
        },
        { maxAgeMs: DAY_SUMMARY_MAX_AGE_MS }
    );
    const inFlight = useRef(false);
    const paramsKey = JSON.stringify(params ?? null);

    const load = useCallback(async () => {
        if (!driverId || inFlight.current) return;
        inFlight.current = true;
        try {
            const query = JSON.parse(paramsKey) as Record<string, unknown> | null;
            const body = summaryOf(await cachedGet(adapter, `drivers/${driverId}/day-summary`, query ?? undefined));
            if (body) setKept({ summary: body, fetchedAt: Date.now() });
        } catch {
            // An older server, or no signal: the last answer stands, and the screen has its own figures.
        } finally {
            inFlight.current = false;
        }
    }, [adapter, driverId, paramsKey, setKept]);

    useEffect(() => {
        void load();
    }, [load, reloadKey]);

    return { summary: kept?.summary ?? null, fetchedAt: kept?.fetchedAt, refresh: load };
}
