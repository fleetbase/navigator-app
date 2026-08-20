/**
 * Formatters for the v3 tree.
 *
 * The plan intended v3 to share src/utils/format.js rather than fork it, but
 * that module imports src/utils/index.js, which imports the **v2 tamagui.config**
 * for its non-reactive `getTheme` helper. Pulling it into v3 therefore loads a
 * second Tamagui config ("duplicate Tamagui dependencies") and drags the whole
 * v2 provider stack into any test that touches a card.
 *
 * These are re-implemented rather than re-exported for that reason. They are
 * small and pure; the sharing can be restored once `getTheme` is lifted out of
 * the utils barrel (tracked as a Phase 1 task).
 *
 * Behaviour matches src/utils/format.js so v2 and v3 read identically during the
 * parallel period — except that formatMeters now honours the unit preference,
 * which the design's imperial/metric toggle requires.
 */

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
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}
