/**
 * The driver's last seven days, one day summary each (`GET drivers/{id}/day-summary`).
 *
 * The home screen draws a week of work from it when there is nothing to drive
 * to. A finished day does not change, so its answer is kept for the life of the
 * app and only today is asked for again. A server without the route answers
 * nothing, and the week is then simply not drawn.
 */
import { useEffect, useMemo, useState } from 'react';
import { useFleetbase } from '../api';
import { dayKey } from './orderStore';
import type { DaySummary } from './useDaySummary';

export interface WeekDay {
    /** YYYY-MM-DD. */
    date: string;
    isToday: boolean;
    summary?: DaySummary;
}

const kept = new Map<string, DaySummary>();

function lastSevenDays(today: string): string[] {
    const [y, m, d] = today.split('-').map(Number);
    return Array.from({ length: 7 }, (_, index) => dayKey(new Date(y, m - 1, d - (6 - index), 12)));
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
    const dates = useMemo(() => lastSevenDays(today), [today]);
    const [, setRevision] = useState(0);

    useEffect(() => {
        if (!driverId || !enabled) return;
        let alive = true;
        const timezone = deviceTimezone();
        const wanted = dates.filter((date) => date === today || !kept.has(`${driverId}:${date}`));
        void Promise.all(
            wanted.map(async (date) => {
                try {
                    const raw = (await adapter.get(`drivers/${driverId}/day-summary`, timezone ? { date, timezone } : { date })) as unknown;
                    const body = ((raw as { data?: unknown })?.data ?? raw) as DaySummary | null;
                    if (body && typeof body === 'object' && typeof body.date === 'string') kept.set(`${driverId}:${date}`, body);
                } catch {
                    // No answer for this day; its bar is left empty.
                }
            })
        ).then(() => {
            if (alive) setRevision((n) => n + 1);
        });
        return () => {
            alive = false;
        };
    }, [adapter, driverId, enabled, dates, today, reloadKey]);

    const days: WeekDay[] = dates.map((date) => ({ date, isToday: date === today, summary: driverId ? kept.get(`${driverId}:${date}`) : undefined }));
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

    return { days, totals, known };
}

export default useWeekSummary;
