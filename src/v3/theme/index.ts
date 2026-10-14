/**
 * Waypoint — the v3 Tamagui configuration.
 *
 * Deliberately does NOT inherit @tamagui/config/v3 wholesale (as the v2 config
 * did) and does NOT flatten the Tailwind ramp into every theme. v3 screens use
 * semantic tokens only; if a screen needs a colour that isn't a token, the token
 * set is wrong.
 *
 * The v2 config stays in place and keeps serving the v2 tree until cutover —
 * App.tsx selects one config or the other from the v3 feature flag, so the two
 * token vocabularies never mix inside one provider.
 */
import { shorthands } from '@tamagui/shorthands';
import { createTamagui, createTokens } from 'tamagui';
import { animations } from './animations';
import { fonts } from './fonts';
import { themes, DEFAULT_SCHEME, SCHEMES, isDarkScheme, type SchemeName, type WaypointTheme } from './themes';
import { spaceTokens, radiusTokens, zIndexTokens, layer, space, radius, type, glanceable, tabular, elevation, motion, sheetDetents, hitTarget } from './tokens';

const tokens = createTokens({
    space: spaceTokens,
    size: spaceTokens,
    radius: radiusTokens,
    zIndex: zIndexTokens,
    // Colour lives in themes, not tokens — a v3 component must resolve colour
    // through the active scheme so it can never hard-code a light/dark value.
    color: {},
});

export const waypointConfig = createTamagui({
    // Standard Tamagui shorthands (px, py, bg, mt…). Omitting these was a
    // mistake in the first cut of this config: every ported component and every
    // Tamagui idiom in the wild assumes they exist.
    shorthands,
    animations,
    fonts,
    themes,
    tokens,
    defaultFont: 'body',
    settings: {
        allowedStyleValues: 'somewhat-strict',
        // Screens are authored against the token names; surfacing a typo at dev
        // time is worth more than silently rendering a raw string.
        onlyAllowShorthands: false,
    },
});

export type WaypointConfig = typeof waypointConfig;

export {
    themes,
    SCHEMES,
    DEFAULT_SCHEME,
    isDarkScheme,
    space,
    radius,
    type,
    glanceable,
    tabular,
    elevation,
    motion,
    sheetDetents,
    hitTarget,
    layer,
};
export type { SchemeName, WaypointTheme };
export * from './palette';

export default waypointConfig;

/**
 * Registers the Waypoint config with Tamagui's types so tokens, themes and
 * shorthands are known at the type level. tamagui.config.ts declares the same
 * augmentation for the v2 tree; the two never appear in one program because
 * tsconfig.v3.json only includes src/v3. Remove the v2 declaration at cutover.
 */
declare module 'tamagui' {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface TamaguiCustomConfig extends WaypointConfig {}
}
