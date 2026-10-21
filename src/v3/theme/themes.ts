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
import { getBuildBranding } from '../branding/build-branding';
import {
    SCHEMES,
    type SchemeName,
    schemePalettes,
    nightPrimary,
    feedbackHues,
    statusHues,
    legibleOn,
    stopTypeHues,
    alpha,
    withAlpha,
} from './palette';

/** `driver_assigned` -> `driverAssigned` */
function camel(key: string): string {
    return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * The brand, resolved once at module load from the build's branding
 * (brand/navigator.brand.ts over the legacy env keys — see src/v3/branding). A
 * white-label build ships one brand, which is why there are four themes rather
 * than four-per-brand.
 */
const branding = getBuildBranding().branding;
const brand = branding.colors;

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
 *
 * The text colour is **per scheme**, which it previously was not. The comment
 * here used to claim the full-strength hue "clears AA on both the tinted fill
 * and the scheme background" — measured, it does not. The eleven hues were
 * authored against dark grounds, where they score 4.5–10.6, and reused
 * unchanged on light and sunlight, where **every one of them fails**: 3.91 down
 * to 1.78 for `on_hold`. Sunlight is the worst place to lose contrast, being
 * the scheme meant for reading in direct sun.
 *
 * `legibleOn` walks each hue toward black or white only as far as the threshold
 * demands, so the design's colour identity survives and only its lightness
 * moves — and only where it has to. Fill and border keep the original hue,
 * since a 12% tint is decoration rather than text.
 */
function statusFamily(scheme: SchemeName) {
    const surface = schemePalettes[scheme].surface;
    const out: Record<string, string> = {};
    for (const [key, { hue }] of Object.entries(statusHues)) {
        const name = camel(key);
        out[`${name}Fill`] = withAlpha(hue, alpha.fill);
        out[`${name}Border`] = withAlpha(hue, alpha.stroke);
        out[`${name}Text`] = legibleOn(hue, surface);
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
        ...statusFamily(scheme),
        ...stopTypeFamily(),

        // ── absolutes ────────────────────────────────────────────────────────
        white: '#FFFFFF',
        black: '#000000',
        transparent: 'rgba(0,0,0,0)',
    };
}

/**
 * Token overrides from branding (`colors.tokens`, and the legacy CUSTOM_COLORS*
 * env keys), applied LAST so they can actually reach a semantic token — shared,
 * then per mode, then per scheme.
 */
function overridesFor(scheme: SchemeName): Record<string, string> {
    return branding.colors.tokens[scheme] ?? {};
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
