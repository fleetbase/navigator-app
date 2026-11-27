/**
 * Calendar arithmetic and labels for the Jobs schedule.
 *
 * Everything works on day keys (`YYYY-MM-DD`, the phone's local day — see
 * `dayKey`), built as *local* dates: `new Date('2026-11-27')` is midnight UTC,
 * which west of Greenwich is the evening before.
 *
 * Labels are day-first ("Sat 28 Nov", "23 – 29 Nov") and are put together from
 * the day number and the month name asked for separately. Asking the system
 * for "day and month" in one go hands back the phone's own order, and an
 * American phone answers "Nov 29".
 */
import { currentLocale } from '../../i18n';
import { dayKey } from '../../data/orderStore';

export function dateOfKey(key: string): Date {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(key: string, days: number): string {
    const date = dateOfKey(key);
    date.setDate(date.getDate() + days);
    return dayKey(date);
}

/** The Monday of the week the day is in. Weeks run Monday to Sunday. */
export function mondayOf(key: string): string {
    const date = dateOfKey(key);
    return addDays(key, -((date.getDay() + 6) % 7));
}

/** The seven days of the week the day is in, Monday first. */
export function weekOf(key: string): string[] {
    const monday = mondayOf(key);
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function firstOfMonth(key: string): string {
    return `${key.slice(0, 7)}-01`;
}

/** The first day of the month `months` away from the day's month. */
export function addMonths(key: string, months: number): string {
    const date = dateOfKey(firstOfMonth(key));
    date.setMonth(date.getMonth() + months);
    return dayKey(date);
}

/** Every day the month's grid shows: whole weeks, Monday first, from the week of the 1st to the week of the last day. */
export function monthGrid(key: string): string[] {
    const first = firstOfMonth(key);
    const last = addDays(addMonths(key, 1), -1);
    const start = mondayOf(first);
    const end = addDays(mondayOf(last), 6);
    const days: string[] = [];
    for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
    return days;
}

function part(key: string, options: Intl.DateTimeFormatOptions): string {
    const date = dateOfKey(key);
    try {
        return date.toLocaleDateString(currentLocale(), options);
    } catch {
        return date.toLocaleDateString(undefined, options);
    }
}

export const dayNumber = (key: string): string => String(dateOfKey(key).getDate());
export const weekdayShort = (key: string): string => part(key, { weekday: 'short' });
export const weekdayLong = (key: string): string => part(key, { weekday: 'long' });
export const monthShort = (key: string): string => part(key, { month: 'short' });
export const monthLong = (key: string): string => part(key, { month: 'long' });

/** "28 Nov" */
export function dayMonth(key: string): string {
    return `${dayNumber(key)} ${monthShort(key)}`;
}

/** "Sat 28 Nov" */
export function weekdayDayMonth(key: string): string {
    return `${weekdayShort(key)} ${dayMonth(key)}`;
}

/** "Saturday 28 November", for a screen reader. */
export function spokenDay(key: string): string {
    return `${weekdayLong(key)} ${dayNumber(key)} ${monthLong(key)}`;
}

/** "23 – 29 Nov", or "30 Nov – 6 Dec" across two months. */
export function rangeLabel(from: string, to: string): string {
    return from.slice(0, 7) === to.slice(0, 7) ? `${dayNumber(from)} – ${dayNumber(to)} ${monthShort(to)}` : `${dayMonth(from)} – ${dayMonth(to)}`;
}

/** "November 2026" */
export function monthYear(key: string): string {
    return `${monthLong(key)} ${dateOfKey(key).getFullYear()}`;
}

/** The start of the first day and the end of the last, as instants: what a server is asked for. */
export function instantRange(from: string, to: string): [string, string] {
    const start = dateOfKey(from);
    const end = dateOfKey(to);
    end.setHours(23, 59, 59, 999);
    return [start.toISOString(), end.toISOString()];
}
