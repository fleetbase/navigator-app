/**
 * The driver's week (Monday to Sunday), one day summary each (`GET drivers/{id}/day-summary`).
 *
 * The home screen draws a week of work from it when there is nothing to drive
 * to. A finished day does not change, so its answer is kept for the life of the
 * app and only today is asked for again. A server without the route answers
 * nothing, and the week is then simply not drawn.
 */
import { useEffect, useMemo, useState } from 'react';
import { useFleetbase } from '../api';
import { cachedGet, peekCacheEntry } from './responseCache';
import { dayKey } from './orderStore';
import type { DaySummary } from './useDaySummary';

export interface WeekDay {
    /** YYYY-MM-DD. */
    date: string;
    isToday: boolean;
    /** A day that has not come yet. */
    isFuture: boolean;
    summary?: DaySummary;
}

const kept = new Map<string, DaySummary>();

const isSummary = (body: unknown): body is DaySummary => !!body && typeof body === 'object' && typeof (body as DaySummary).date === 'string';

/** The request for one day, the same for the fetch and for reading its kept answer. */
function dayParams(date: string, timezone?: string): Record<string, unknown> {
    return timezone ? { date, timezone } : { date };
}

/**
 * One day's summary from this session's answers, or from the response cache
 * when the app has been relaunched since. A finished day is taken from the
 * cache however old (it will not change); today only while its answer is
 * recent, as for the day summary on its own.
 */
function summaryFor(driverId: string, date: string, today: string, timezone?: string): DaySummary | undefined {
    const id = `${driverId}:${date}`;
    const held = kept.get(id);
    if (held) return held;
    const entry = peekCacheEntry(`drivers/${driverId}/day-summary`, dayParams(date, timezone), date < today ? {} : { maxAgeMs: 6 * 60 * 60 * 1000 });
    const body = ((entry?.value as { data?: unknown })?.data ?? entry?.value) as unknown;
    if (!isSummary(body)) return undefined;
    // Kept for the session only when finished: today is asked for again regardless, and its answer replaces this.
    if (date < today) kept.set(id, body);
    return body;
}

/** Monday to Sunday of the week `today` is in, then the day before that Monday (for "yesterday" on a Monday). */
function weekOf(today: string): { week: string[]; before: string } {
    const [y, m, d] = today.split('-').map(Number);
    const sinceMonday = (new Date(y, m - 1, d, 12).getDay() + 6) % 7;
    const at = (offset: number) => dayKey(new Date(y, m - 1, d - sinceMonday + offset, 12));
    return { week: Array.from({ length: 7 }, (_, index) => at(index)), before: at(-1) };
}

function deviceTimezone(): string | undefined {
    try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return typeof zone === 'string' && zone.includes('/') ? zone : undefined;
    } catch {
        return undefined;
    }
}

export function useWeekSummary(driverId?: string, reloadKey: string | number = 0, enabled = true) {
    const { adapter } = useFleetbase();
    const today = dayKey();
    const { week: dates, before } = useMemo(() => weekOf(today), [today]);
    const [, setRevision] = useState(0);
    // True until the first answer (or failure) is in, so the screen can hold the week's place while it waits.
    const [settled, setSettled] = useState(false);

    useEffect(() => {
        if (!driverId || !enabled) return;
        let alive = true;
        const timezone = deviceTimezone();
        // Days still to come have nothing to ask about, and a finished day already known (this session or kept from before) is not asked again.
        const wanted = [before, ...dates].filter((date) => date <= today && (date === today || !summaryFor(driverId, date, today, timezone)));
        void Promise.all(
            wanted.map(async (date) => {
                try {
                    const raw = await cachedGet(adapter, `drivers/${driverId}/day-summary`, dayParams(date, timezone));
                    const body = ((raw as { data?: unknown })?.data ?? raw) as unknown;
                    if (isSummary(body)) kept.set(`${driverId}:${date}`, body);
                } catch {
                    // No answer for this day; its bar is left empty.
                }
            })
        ).then(() => {
            if (!alive) return;
            setSettled(true);
            setRevision((n) => n + 1);
        });
        return () => {
            alive = false;
        };
    }, [adapter, driverId, enabled, dates, before, today, reloadKey]);

    const timezone = deviceTimezone();
    const days: WeekDay[] = dates.map((date) => ({ date, isToday: date === today, isFuture: date > today, summary: driverId && date <= today ? summaryFor(driverId, date, today, timezone) : undefined }));
    // The day before today, which on a Monday is last week's Sunday.
    const [ty, tm, td] = today.split('-').map(Number);
    const yesterday = driverId ? summaryFor(driverId, dayKey(new Date(ty, tm - 1, td - 1, 12)), today, timezone) : undefined;
    const known = days.some((day) => !!day.summary);
    const totals = days.reduce(
        (sum, day) => ({
            waypoints: sum.waypoints + (day.summary?.waypoints?.completed ?? 0),
            orders: sum.orders + (day.summary?.orders_completed ?? 0),
            distanceM: sum.distanceM + (day.summary?.distance_driven_m ?? 0),
            seconds: sum.seconds + (day.summary?.seconds_on_duty ?? 0),
        }),
        { waypoints: 0, orders: 0, distanceM: 0, seconds: 0 }
    );

    return { days, totals, known, yesterday, from: dates[0], to: dates[6], isLoading: !!driverId && enabled && !known && !settled };
}

export default useWeekSummary;
