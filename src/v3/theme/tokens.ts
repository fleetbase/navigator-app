/**
 * Waypoint scale tokens — space, radius, type, elevation, motion.
 * Source: "Navigator Design System.dc.html" sections 03–04.
 *
 * The old config inherited every scale from @tamagui/config/v3, so components
 * mixed `fontSize='$2'` with `fontSize={16}` and nothing was enforced. These are
 * the design's actual scales, named so a screen can only reach for a real step.
 */

/** 4dp grid. */
export const space = {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 24,
    6: 32,
    7: 48,
} as const;

export const radius = {
    /** Chips, inputs, small cards. */
    compact: 10,
    /** Hero cards, sheets, map overlays. */
    hero: 18,
    /** Pills and fully-round controls. */
    pill: 999,
} as const;

/**
 * Minimum interactive target. The design mandates 48dp for buttons and 44dp for
 * the stop-sequence badge; anything smaller must not be the only way to act.
 */
export const hitTarget = {
    min: 44,
    button: 48,
} as const;

/**
 * Type scale. `weight`/`letterSpacing` are part of the token — the design's
 * hierarchy depends on weight as much as size, so they travel together.
 */
export interface TypeStep {
    size: number;
    weight: '400' | '500' | '600' | '700' | '800';
    letterSpacing: number;
    lineHeight: number;
}

export const type = {
    display: { size: 34, weight: '800', letterSpacing: -0.68, lineHeight: 40 },
    title: { size: 28, weight: '700', letterSpacing: -0.42, lineHeight: 34 },
    heading: { size: 22, weight: '700', letterSpacing: -0.22, lineHeight: 28 },
    body: { size: 17, weight: '500', letterSpacing: 0, lineHeight: 24 },
    secondary: { size: 15, weight: '500', letterSpacing: 0, lineHeight: 21 },
    caption: { size: 13, weight: '600', letterSpacing: 0.13, lineHeight: 18 },
    micro: { size: 11, weight: '700', letterSpacing: 0.66, lineHeight: 15 },
} satisfies Record<string, TypeStep>;

/**
 * Glanceable tier — readable at arm's length while the vehicle is moving.
 * Always tabular, always paired with a caption label beneath.
 */
export const glanceable = {
    /** ETA on the driving/glance surface. */
    hero: { size: 56, weight: '800', letterSpacing: -1.12, lineHeight: 58 },
    /** Distance remaining. */
    major: { size: 40, weight: '800', letterSpacing: -0.8, lineHeight: 44 },
    /** Next-stop card metrics. */
    metric: { size: 21, weight: '800', letterSpacing: 0, lineHeight: 24 },
} satisfies Record<string, TypeStep>;

/**
 * Anything representing distance, time, money, odometer or an identifier must
 * be tabular so digits don't jitter as values tick.
 */
export const tabular = { fontVariant: ['tabular-nums'] as const };

/**
 * Elevation. Values are the design's; `shadowColor` is intentionally absent —
 * `themes.ts` supplies it per scheme so shadows read correctly on light.
 */
export const elevation = {
    base: { shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
    card: { shadowOpacity: 0.12, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    sheet: { shadowOpacity: 0.25, shadowRadius: 32, shadowOffset: { width: 0, height: -8 }, elevation: 16 },
    floating: { shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
    mapOverlay: { shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
} as const;

/**
 * Motion. Hard ceiling of 250ms — nothing may delay the driver's next tap.
 * Durations feed react-native-reanimated; springs are damping ratios.
 */
export const motion = {
    sheet: { duration: 220, spring: 0.86 },
    listReorder: { duration: 180, easing: 'ease-out' },
    statusConfirm: { duration: 240, spring: 0.8 },
    syncTick: { duration: 200, easing: 'ease-out' },
    press: { duration: 90, easing: 'linear', scale: 0.97 },
} as const;

/** Bottom-sheet detents, as fractions of screen height. */
export const sheetDetents = {
    peek: 0.22,
    half: 0.5,
    full: 0.92,
} as const;

/** Tamagui `size`/`space` token maps (numeric keys mirror the 4dp grid). */
export const spaceTokens = {
    true: space[4],
    0: space[0],
    1: space[1],
    2: space[2],
    3: space[3],
    4: space[4],
    5: space[5],
    6: space[6],
    7: space[7],
} as const;

export const radiusTokens = {
    true: radius.compact,
    0: 0,
    compact: radius.compact,
    hero: radius.hero,
    pill: radius.pill,
} as const;

/**
 * Semantic layering, for direct use in style props (`zIndex={layer.sheet}`).
 *
 * NOT a Tamagui token map: createTamagui validates `tokens.zIndex` keys against
 * `$0`–`$7`/`$true` and throws at runtime on anything else. That check is
 * native/dev-only, so it passes in jest and fails on device — which is how this
 * reached the simulator before being caught.
 */
export const layer = {
    base: 0,
    card: 10,
    mapOverlay: 100,
    header: 200,
    sheet: 300,
    banner: 400,
    toast: 500,
    modal: 600,
} as const;

/** The numeric scale Tamagui accepts, ordered to match `layer`. */
export const zIndexTokens = {
    0: layer.base,
    1: layer.card,
    2: layer.mapOverlay,
    3: layer.header,
    4: layer.sheet,
    5: layer.banner,
    6: layer.toast,
    7: layer.modal,
    true: layer.base,
} as const;
