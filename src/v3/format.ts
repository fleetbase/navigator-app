/**
 * Formatters for the v3 tree.
 *
 * These were duplicated because `src/utils/format.js` imports the
 * `src/utils/index.js` barrel, and that barrel imported the **v2 tamagui.config**
 * for one non-reactive `getTheme` helper — so any v3 file touching a v2
 * formatter loaded a second Tamagui config and dragged the v2 provider stack
 * into its tests.
 *
 * That blocker is gone: `getTheme` now lives in `src/utils/theme.js`, and
 * `__tests__/shared-formatters.test.ts` imports the v2 formatters from v3 to
 * prove it stays gone.
 *
 * What remains here is deliberate rather than accidental:
 *
 *   - `formatMeters` honours the driver's metric/imperial preference. v2's is
 *     metric-only, and the design's unit toggle needs this one.
 *   - `formatMoney`, `formatWeight` and `formatDimensions` have no v2
 *     equivalent — they were written for the payload and fuel screens.
 *   - `formatDuration` and `formatClock` are small and pure, and v2's variants
 *     hard-code English ("2 hours ago"), which the i18n pass would have to undo.
 *
 * Anything that genuinely duplicates v2 should now be imported from it instead.
 */
import { currentLocale } from './i18n';

export type DistanceUnit = 'metric' | 'imperial';

const M_PER_MILE = 1609.344;
const M_PER_FOOT = 0.3048;

/** "840 m" · "2.4 km" · "0.5 mi" — always with one decimal at most. */
export function formatMeters(meters?: number | null, unit: DistanceUnit = 'metric'): string {
    if (meters == null || !Number.isFinite(meters)) return '—';
    const m = Math.max(0, meters);

    if (unit === 'imperial') {
        if (m < M_PER_MILE / 10) return `${Math.round(m / M_PER_FOOT)} ft`;
        return `${Math.round((m / M_PER_MILE) * 10) / 10} mi`;
    }

    if (m < 1000) return `${Math.round(m)} m`;
    return `${Math.round((m / 1000) * 10) / 10} km`;
}

/** "1 h 05 m" · "42 m" · "30 s" — at most two units, largest first. */
export function formatDuration(seconds?: number | null): string {
    if (seconds == null || !Number.isFinite(seconds)) return '—';
    const total = Math.max(0, Math.round(seconds));

    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;

    const parts: string[] = [];
    if (h) parts.push(`${h} h`);
    if (m) parts.push(h ? `${String(m).padStart(2, '0')} m` : `${m} m`);
    if (parts.length < 2 && s) parts.push(`${s} s`);
    if (!parts.length) return '0 s';

    return parts.slice(0, 2).join(' ');
}

/** Clock time from an ISO string, in the device's locale. "14:32" */
export function formatClock(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Date and time together, for a record's history. "21 Aug 2026, 12:08"
 *
 * `toLocaleString()` with no arguments was rendering "8/21/2026, 12:08:20 PM"
 * on a device set to en-GB — the seconds are noise on a filing timestamp, and
 * the month/day order is ambiguous to most of the world. An explicit month name
 * cannot be misread whatever the locale.
 */
export function formatDateTime(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(currentLocale(), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

/**
 * A calendar day, for manifest rows. "19 Aug" · with `weekday`, "Thu, 21 Aug".
 *
 * Takes a day key (`YYYY-MM-DD`) or an ISO timestamp. A bare day is built as a
 * *local* date on purpose: `new Date('2026-08-19')` is midnight UTC, which in
 * any timezone west of Greenwich is the evening of the 18th.
 */
export function formatDay(day?: string | null, options: { weekday?: boolean } = {}): string {
    if (!day) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(day);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short', ...(options.weekday ? { weekday: 'short' } : {}) });
}

/**
 * Money.
 *
 * Fleetbase stores amounts in **minor units**, as a string — a live entity
 * carries `price: "2850", currency: "USD"`, meaning $28.50. Rendering the raw
 * value shows a price ~100× too high, so the divide is not optional.
 *
 * Zero-decimal currencies (JPY, KRW, VND…) store major units directly and must
 * not be divided. The list is the ISO 4217 set with an exponent of 0.
 */
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);

export function formatMoney(amount?: string | number | null, currency = 'USD'): string {
    if (amount == null || amount === '') return '—';
    const raw = typeof amount === 'string' ? Number(amount) : amount;
    if (!Number.isFinite(raw)) return '—';

    const code = (currency || 'USD').toUpperCase();
    const zeroDecimal = ZERO_DECIMAL.has(code);
    const major = zeroDecimal ? raw : raw / 100;

    try {
        return new Intl.NumberFormat(currentLocale(), {
            style: 'currency',
            currency: code,
            minimumFractionDigits: zeroDecimal ? 0 : 2,
            maximumFractionDigits: zeroDecimal ? 0 : 2,
        }).format(major);
    } catch {
        // Unknown/!ISO code — still show the number rather than an em dash.
        return `${major.toFixed(zeroDecimal ? 0 : 2)} ${code}`;
    }
}

/** "12.5 kg" — the unit comes from the record, so it is never assumed. */
export function formatWeight(value?: string | number | null, unit?: string | null): string {
    if (value == null || value === '') return '—';
    const n = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(n)) return '—';
    return unit ? `${n} ${unit}` : String(n);
}

/**
 * "40 × 30 × 25 cm", or a partial set when only some sides are known.
 * Returns undefined when nothing is known, so the caller can omit the row
 * rather than print three em dashes.
 */
export function formatDimensions(
    length?: string | number | null,
    width?: string | number | null,
    height?: string | number | null,
    unit?: string | null
): string | undefined {
    const sides = [length, width, height]
        .map((v) => (v == null || v === '' ? null : Number(v)))
        .map((n) => (n != null && Number.isFinite(n) ? String(n) : null));

    if (sides.every((s) => s == null)) return undefined;
    const body = sides.map((s) => s ?? '?').join(' × ');
    return unit ? `${body} ${unit}` : body;
}

/** A plain number in the driver's locale — "12,480" · "12.480" · "١٢٬٤٨٠". */
export function formatNumber(value?: number | string | null, options: Intl.NumberFormatOptions = {}): string {
    if (value == null || value === '') return '—';
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat(currentLocale(), options).format(n);
}
