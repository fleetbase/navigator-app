/**
 * Waypoint themes — four schemes, one build-time brand.
 *
 * Two problems in the v2 theme layer are fixed here:
 *
 * 1. `CUSTOM_COLORS` / `CUSTOM_COLORS_LIGHT` / `CUSTOM_COLORS_DARK` were spread
 *    *before* the semantic definitions in tamagui.config.ts (lines 130-131 and
 *    169-170), and `flattenTailwindCssColorsObject` landed last. No env override
 *    could change a semantic token — white-labelling was silently inert. Here the
 *    overrides are applied last, so they actually win.
 *
 * 2. Status colour only existed as a raw hue, so ~30 components branched on
 *    `isDarkMode` to pick a fill by hand. Every status and feedback family now
 *    ships a resolved `Fill` / `Border` / `Text` triple per scheme, so components
 *    read one token and never ask what scheme they're in.
 */
import { config, parseConfigObjectString } from '../../utils/tamagui';
import {
    SCHEMES,
    type SchemeName,
    schemePalettes,
    brandPresets,
    nightPrimary,
    feedbackHues,
    statusHues,
    stopTypeHues,
    alpha,
    withAlpha,
} from './palette';

/** `driver_assigned` -> `driverAssigned` */
function camel(key: string): string {
    return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Resolve the brand once, at module load. A white-label build ships one brand,
 * which is why there are four themes rather than four-per-brand.
 *
 * NAVIGATOR_BRAND_PRIMARY (raw hex) wins over NAVIGATOR_BRAND / APP_THEME (preset
 * name). APP_THEME is the v2 env var, honoured so existing builds keep their accent.
 */
function resolveBrand() {
    const presetName = config('NAVIGATOR_BRAND', config('APP_THEME', 'fleetbase'));
    const preset = brandPresets[String(presetName).toLowerCase()] ?? brandPresets.fleetbase;

    const explicitPrimary = config('NAVIGATOR_BRAND_PRIMARY', '');
    if (typeof explicitPrimary === 'string' && /^#[0-9a-f]{6}$/i.test(explicitPrimary)) {
        return { ...preset, primary: explicitPrimary, sunlightPrimary: explicitPrimary };
    }

    return preset;
}

const brand = resolveBrand();

/** Feedback + status tint colours are derived, not hand-authored per scheme. */
function feedbackFamily(scheme: SchemeName) {
    const pick = (k: keyof typeof feedbackHues) => (scheme === 'night' ? feedbackHues[k].night : feedbackHues[k].base);

    const success = pick('success');
    const warning = pick('warning');
    const danger = pick('danger');
    const info = pick('info');

    return {
        success,
        successFill: withAlpha(success, alpha.fillSuccess),
        successBorder: withAlpha(success, alpha.stroke),
        successText: success,

        warning,
        warningFill: withAlpha(warning, alpha.fill),
        warningBorder: withAlpha(warning, alpha.stroke),
        warningText: warning,

        danger,
        dangerFill: withAlpha(danger, alpha.fillDanger),
        dangerBorder: withAlpha(danger, alpha.strokeDanger),
        dangerText: danger,

        info,
        infoFill: withAlpha(info, alpha.fill),
        infoBorder: withAlpha(info, alpha.stroke),
        infoText: info,
    };
}

/**
 * One `<tone>Fill` / `<tone>Border` / `<tone>Text` triple per status.
 * Text is the full-strength hue — it clears AA on both the tinted fill and the
 * scheme background, which is what lets a single token serve every scheme.
 */
function statusFamily() {
    const out: Record<string, string> = {};
    for (const [key, { hue }] of Object.entries(statusHues)) {
        const name = camel(key);
        out[`${name}Fill`] = withAlpha(hue, alpha.fill);
        out[`${name}Border`] = withAlpha(hue, alpha.stroke);
        out[`${name}Text`] = hue;
    }
    return out;
}

function stopTypeFamily() {
    const out: Record<string, string> = {};
    for (const [key, hue] of Object.entries(stopTypeHues)) {
        out[`stop${key[0].toUpperCase()}${key.slice(1)}`] = hue;
        out[`stop${key[0].toUpperCase()}${key.slice(1)}Fill`] = withAlpha(hue, alpha.fill);
        out[`stop${key[0].toUpperCase()}${key.slice(1)}Border`] = withAlpha(hue, alpha.stroke);
    }
    return out;
}

function brandFor(scheme: SchemeName) {
    // Night driving overrides the brand entirely — amber only, to protect night vision.
    if (scheme === 'night') {
        return { primary: nightPrimary.primary, primaryDeep: nightPrimary.primaryDeep, onPrimary: nightPrimary.onPrimary };
    }
    // Sunlight needs the darker brand step to hold contrast against white.
    if (scheme === 'sunlight') {
        return { primary: brand.sunlightPrimary, primaryDeep: brand.sunlightPrimary, onPrimary: brand.onPrimary };
    }
    return { primary: brand.primary, primaryDeep: brand.primaryDeep, onPrimary: brand.onPrimary };
}

function buildScheme(scheme: SchemeName) {
    const p = schemePalettes[scheme];
    const b = brandFor(scheme);

    return {
        // ── structure ────────────────────────────────────────────────────────
        background: p.background,
        surface: p.surface,
        surfaceRaised: p.surfaceRaised,
        border: p.border,
        // Shadows must be near-black on light and pure black on dark, or cards
        // float on light and disappear on dark.
        shadowColor: p.isDark ? '#000000' : '#0C1524',

        // ── text ─────────────────────────────────────────────────────────────
        textPrimary: p.textPrimary,
        textSecondary: p.textSecondary,
        textMuted: p.textMuted,

        // ── brand ────────────────────────────────────────────────────────────
        primary: b.primary,
        primaryDeep: b.primaryDeep,
        onPrimary: b.onPrimary,
        primaryFill: withAlpha(b.primary, alpha.fill),
        primaryBorder: withAlpha(b.primary, alpha.stroke),
        primaryGlow: withAlpha(b.primary, alpha.glow),

        // ── map ──────────────────────────────────────────────────────────────
        mapBackground: p.mapBackground,
        mapLine: p.mapLine,

        // ── families ─────────────────────────────────────────────────────────
        ...feedbackFamily(scheme),
        ...statusFamily(),
        ...stopTypeFamily(),

        // ── absolutes ────────────────────────────────────────────────────────
        white: '#FFFFFF',
        black: '#000000',
        transparent: 'rgba(0,0,0,0)',
    };
}

/**
 * Env overrides, applied LAST so they can actually reach a semantic token.
 * Format is the v2 one: `key:value,key2:value2`.
 *
 * Note the parser splits on `,` and `:`, so values containing either are not
 * expressible — fine for hex, not for rgba(). Keep to hex.
 */
function overridesFor(scheme: SchemeName): Record<string, string> {
    const shared = parseConfigObjectString(config('CUSTOM_COLORS', ''));
    const perMode = schemePalettes[scheme].isDark
        ? parseConfigObjectString(config('CUSTOM_COLORS_DARK', ''))
        : parseConfigObjectString(config('CUSTOM_COLORS_LIGHT', ''));
    const perScheme = parseConfigObjectString(config(`CUSTOM_COLORS_${scheme.toUpperCase()}`, ''));

    return { ...shared, ...perMode, ...perScheme };
}

export type WaypointTheme = ReturnType<typeof buildScheme>;

export const themes = SCHEMES.reduce(
    (acc, scheme) => {
        acc[scheme] = { ...buildScheme(scheme), ...overridesFor(scheme) } as WaypointTheme;
        return acc;
    },
    {} as Record<SchemeName, WaypointTheme>
);

/** Tamagui needs `light`/`dark` to exist for its own inference. */
export const isDarkScheme = (scheme: SchemeName) => schemePalettes[scheme].isDark;

export const DEFAULT_SCHEME: SchemeName = 'dark';

export { SCHEMES, type SchemeName };
