/** Time, the way a chat shows it. */
import { currentLocale } from '../../i18n';
import { formatClock } from '../../format';

const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** A local calendar-day key, so messages either side of midnight UTC still group by the driver's day. */
export function dayKeyOf(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * When a channel last spoke, for the inbox card: the clock today ("14:08"),
 * the weekday within the last week ("Tue"), a date before that ("3 Nov").
 */
export function formatChatWhen(iso?: string | null, now: Date = new Date()): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
    if (days <= 0) return formatClock(iso);
    if (days < 7) return d.toLocaleDateString(currentLocale(), { weekday: 'short' });
    return d.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' });
}

/** The label between two days of a conversation. `today` / `yesterday` are for the caller to translate. */
export function dayLabelOf(iso?: string | null, now: Date = new Date()): 'today' | 'yesterday' | string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    return d.toLocaleDateString(currentLocale(), { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

/** "0:14" — a voice message's length or position. */
export function formatSeconds(seconds?: number | null): string {
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
