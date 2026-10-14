/**
 * Waypoint palette — transcribed from the Navigator Design System
 * (Claude Design project 4dddbb4b-bdbf-4e12-ae68-2970c0c5050d,
 * "Navigator Design System.dc.html", sections 01–02).
 *
 * These are the raw design values. Nothing here is theme-aware; `themes.ts`
 * composes them into the four schemes. Keep this file free of env/config reads
 * so the design values stay auditable against the source document.
 */

/** The four schemes the design ships. `dark` is the product default. */
export type SchemeName = 'dark' | 'light' | 'sunlight' | 'night';

export const SCHEMES: SchemeName[] = ['dark', 'light', 'sunlight', 'night'];

export interface SchemePalette {
    background: string;
    surface: string;
    surfaceRaised: string;
    border: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    /** Fallback primary. `themes.ts` overrides this per brand. */
    primary: string;
    onPrimary: string;
    /** Map tile placeholder + graticule, used by the route/map surfaces. */
    mapBackground: string;
    mapLine: string;
    /** Drives Tamagui's light/dark inference and native bar styling. */
    isDark: boolean;
}

export const schemePalettes: Record<SchemeName, SchemePalette> = {
    dark: {
        background: '#0B1017',
        surface: '#121927',
        surfaceRaised: '#1A2333',
        border: '#243044',
        textPrimary: '#F2F5F9',
        textSecondary: '#A8B3C4',
        textMuted: '#64748B',
        primary: '#3D7BFA',
        onPrimary: '#FFFFFF',
        mapBackground: '#0E141F',
        mapLine: '#131B29',
        isDark: true,
    },
    light: {
        background: '#F4F6F9',
        surface: '#FFFFFF',
        // The design-system doc lists #FFFFFF here, but that makes surfaceRaised
        // indistinguishable from surface. The interactive prototype uses #EDF1F6,
        // which is what the light screens actually render. Prototype wins.
        surfaceRaised: '#EDF1F6',
        border: '#E2E8F0',
        textPrimary: '#101828',
        textSecondary: '#46536A',
        textMuted: '#8494AB',
        primary: '#2E63D9',
        onPrimary: '#FFFFFF',
        mapBackground: '#E9EEF5',
        mapLine: '#DBE3EE',
        isDark: false,
    },
    sunlight: {
        background: '#FFFFFF',
        surface: '#FFFFFF',
        surfaceRaised: '#F2F4F7',
        // Deliberately near-black: the high-contrast scheme outlines everything.
        border: '#101828',
        textPrimary: '#000000',
        textSecondary: '#1D2939',
        textMuted: '#475467',
        primary: '#0040DD',
        onPrimary: '#FFFFFF',
        mapBackground: '#F2F4F7',
        mapLine: '#D5DAE3',
        isDark: false,
    },
    night: {
        background: '#0C0906',
        surface: '#151009',
        surfaceRaised: '#1E1710',
        border: '#2C2114',
        textPrimary: '#E8D9C5',
        textSecondary: '#B39C7D',
        textMuted: '#6E5D45',
        primary: '#D98A3D',
        onPrimary: '#160D02',
        mapBackground: '#120D08',
        mapLine: '#1A130C',
        isDark: true,
    },
};

/**
 * Brand presets. A white-label build resolves exactly one of these at build
 * time (or supplies its own hex via NAVIGATOR_BRAND_PRIMARY), which is why the
 * app ships four themes rather than four-times-N.
 */
export interface BrandPreset {
    primary: string;
    /** Pressed / deep variant. */
    primaryDeep: string;
    onPrimary: string;
    /** Sunlight needs a darker primary to hold contrast against white. */
    sunlightPrimary: string;
}

export const brandPresets: Record<string, BrandPreset> = {
    fleetbase: { primary: '#3D7BFA', primaryDeep: '#2E63D9', onPrimary: '#FFFFFF', sunlightPrimary: '#0040DD' },
    acme: { primary: '#0FA36B', primaryDeep: '#0B7F53', onPrimary: '#FFFFFF', sunlightPrimary: '#00754A' },
    // Legacy APP_THEME accents, kept so existing white-label builds keep working.
    blue: { primary: '#3D7BFA', primaryDeep: '#2E63D9', onPrimary: '#FFFFFF', sunlightPrimary: '#0040DD' },
    red: { primary: '#EF4444', primaryDeep: '#B91C1C', onPrimary: '#FFFFFF', sunlightPrimary: '#B4161B' },
    green: { primary: '#22C55E', primaryDeep: '#15803D', onPrimary: '#FFFFFF', sunlightPrimary: '#116B41' },
    indigo: { primary: '#6366F1', primaryDeep: '#4338CA', onPrimary: '#FFFFFF', sunlightPrimary: '#3730A3' },
    orange: { primary: '#F97316', primaryDeep: '#C2410C', onPrimary: '#FFFFFF', sunlightPrimary: '#9A3412' },
};

/** Night driving overrides the brand entirely — amber only, to protect night vision. */
export const nightPrimary = { primary: '#D98A3D', primaryDeep: '#B06E2C', onPrimary: '#160D02' };

/**
 * Feedback hues. `night` swaps success to amber because saturated green reads
 * as a light source at night.
 */
export const feedbackHues = {
    success: { base: '#2FBF71', night: '#B8A24A' },
    warning: { base: '#F5A623', night: '#F5A623' },
    danger: { base: '#E5484D', night: '#E5484D' },
    info: { base: '#4C9AFF', night: '#D98A3D' },
};

/**
 * Status treatments. Design principle: never colour-only — every status pairs a
 * hue with a distinct marker shape and glyph so it survives colour-blindness,
 * glare, and greyscale printing.
 */
export type StatusShape = 'circle' | 'square' | 'diamond';

export interface StatusHue {
    hue: string;
    glyph: string;
    shape: StatusShape;
    /**
     * The design document's own label for this tone. Humanising the raw status
     * key is not equivalent — `driver_enroute` humanises to "Driver Enroute",
     * but the design (and every dispatcher) calls it "En route".
     */
    label: string;
}

export const statusHues = {
    created: { hue: '#8394AB', glyph: '·', shape: 'circle', label: 'Created' },
    preparing: { hue: '#4C9AFF', glyph: '·', shape: 'circle', label: 'Preparing' },
    dispatched: { hue: '#4C9AFF', glyph: '»', shape: 'square', label: 'Dispatched' },
    driver_assigned: { hue: '#8B7CF6', glyph: 'A', shape: 'square', label: 'Assigned' },
    driver_enroute: { hue: '#F5A623', glyph: '»', shape: 'diamond', label: 'En route' },
    started: { hue: '#3D7BFA', glyph: '▸', shape: 'square', label: 'Started' },
    arrived: { hue: '#22B8A8', glyph: '◎', shape: 'circle', label: 'Arrived' },
    completed: { hue: '#2FBF71', glyph: '✓', shape: 'circle', label: 'Completed' },
    canceled: { hue: '#8394AB', glyph: '×', shape: 'square', label: 'Canceled' },
    failed: { hue: '#E5484D', glyph: '!', shape: 'diamond', label: 'Failed' },
    on_hold: { hue: '#E3C000', glyph: '‖', shape: 'square', label: 'On hold' },
} satisfies Record<string, StatusHue>;

export type StatusTone = keyof typeof statusHues;

/** Stop-type hues used by the route list / map pins. */
export const stopTypeHues = {
    pickup: '#8B7CF6',
    dropoff: '#22B8A8',
    return: '#4C9AFF',
    break: '#F5A623',
};

/**
 * Alpha suffixes from the design doc. Status pills are `hue + FILL` on a
 * `hue + STROKE` border; the design writes these as 8-digit hex.
 */
export const alpha = {
    /** 12% — pill and tint fills. */
    fill: '1f',
    /** 30% — pill and tint borders. */
    stroke: '4d',
    /** 15% — success tint. */
    fillSuccess: '26',
    /** 8% — danger tint (kept lighter; red reads heavier at equal alpha). */
    fillDanger: '14',
    /** 40% — danger border, and the brand glow under floating actions. */
    strokeDanger: '66',
    glow: '40',
};

/** `withAlpha('#2FBF71', alpha.fill)` → `'#2FBF711f'`. */
export function withAlpha(hex: string, suffix: string): string {
    return `${hex}${suffix}`;
}

/* -- Contrast ------------------------------------------------------------- */

/**
 * Relative luminance, per WCAG 2.1.
 */
export function luminance(hex: string): number {
    const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const r = channel(parseInt(hex.slice(1, 3), 16) / 255);
    const g = channel(parseInt(hex.slice(3, 5), 16) / 255);
    const b = channel(parseInt(hex.slice(5, 7), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mix `hex` toward `target` by `amount` (0–1). */
function mix(hex: string, target: string, amount: number): string {
    const at = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
    const to = (v: number) => Math.round(v).toString(16).padStart(2, '0');
    const r = at(hex, 1) + (at(target, 1) - at(hex, 1)) * amount;
    const g = at(hex, 3) + (at(target, 3) - at(hex, 3)) * amount;
    const b = at(hex, 5) + (at(target, 5) - at(hex, 5)) * amount;
    return `#${to(r)}${to(g)}${to(b)}`;
}

/** WCAG AA for normal text. */
export const AA_CONTRAST = 4.5;

/**
 * The nearest version of `hue` that is legible on `background`.
 *
 * The status hues were authored for dark grounds and reused unchanged on light
 * ones, where **every one of the eleven fails WCAG AA** — from 3.91 down to
 * 1.78 for `on_hold`. Sunlight is the worst place for that, being the scheme
 * meant for reading in direct sun.
 *
 * Rather than invent eleven new colours, this walks the hue toward black (or
 * white, on a dark ground) only as far as it must to clear the threshold. The
 * colour identity the design chose is preserved; only its lightness moves, and
 * only when it has to — a hue that already passes is returned untouched.
 */
export function legibleOn(hue: string, background: string, minimum = AA_CONTRAST): string {
    if (contrastRatio(hue, background) >= minimum) return hue;

    const target = luminance(background) > 0.5 ? '#000000' : '#FFFFFF';
    let best = hue;
    // 5% steps: fine enough to stay close to the hue, coarse enough to end.
    for (let amount = 0.05; amount <= 1.0001; amount += 0.05) {
        best = mix(hue, target, amount);
        if (contrastRatio(best, background) >= minimum) return best;
    }
    return best;
}
