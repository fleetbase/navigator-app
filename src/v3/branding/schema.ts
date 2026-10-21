import { z } from 'zod';
import { isColor } from './color';
import { SCHEMES, brandPresets, statusHues, type SchemeName, type StatusTone } from '../theme/palette';
import { SCREEN_IDS } from '../extensions/screens/screen-ids';
import { CORE_TABS, CUSTOM_TAB_NAME } from '../extensions/tabs';

/**
 * Branding configuration, schema version 1.
 *
 * Everything here is declarative data: it may come from the build
 * (navigator.brand.ts), the legacy environment keys, a development preview, or
 * later a published remote configuration. It never contains code. New optional
 * fields may be added to v1; removing or changing the meaning of a field
 * requires v2 plus a migration in migrations.ts.
 *
 * Deliberately absent, because they are design invariants rather than brand
 * choices: the night scheme's amber primary (night vision), tabular numerals,
 * monospaced identifiers, and status shapes and glyphs (never colour alone).
 */
export const BRANDING_SCHEMA_VERSION = 1 as const;

export const BRAND_PRESETS = Object.keys(brandPresets) as [string, ...string[]];
export const SCHEME_NAMES = SCHEMES as [SchemeName, ...SchemeName[]];
export const STATUS_TONES = Object.keys(statusHues) as [StatusTone, ...StatusTone[]];

/** Icons a core tab can use instead of its own (the design's tab icon set). */
export const TAB_ICONS = CORE_TABS;

export const ColorValue = z.string().max(40).refine(isColor, { message: 'Expected a hex, rgb()/rgba() or named (white, black, transparent) color' });

/** Brand colours are mixed and alpha-suffixed by the theme, so they must be #rrggbb. */
const BrandHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb colour');

/** A Waypoint theme token, e.g. `background`, `surface`, `textPrimary`. */
const TokenKey = z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/, 'Expected a theme token name');

const TokenOverrides = z.record(TokenKey, ColorValue).refine((value) => Object.keys(value).length <= 80, 'At most 80 token overrides');

export const ColorsSchema = z
    .object({
        /** A built-in brand: fleetbase (default), blue, red, green, indigo, orange, acme. */
        preset: z.enum(BRAND_PRESETS),
        /** The brand colour. Without the three below, they are derived from it. */
        primary: BrandHex,
        /** Pressed / deep variant. */
        primaryDeep: BrandHex,
        /** Text and icons on the brand colour. */
        onPrimary: BrandHex,
        /** The brand colour in the sunlight scheme, which needs ≥ 4.5:1 on white. */
        sunlightPrimary: BrandHex,
        /**
         * Theme token overrides, applied last: `all` schemes, the light-mode
         * schemes (light, sunlight), the dark-mode schemes (dark, night), then
         * one scheme.
         */
        tokens: z
            .object({ all: TokenOverrides, lightModes: TokenOverrides, darkModes: TokenOverrides, dark: TokenOverrides, light: TokenOverrides, sunlight: TokenOverrides, night: TokenOverrides })
            .partial()
            .strict(),
    })
    .partial()
    .strict();

export const AppearanceSchema = z
    .object({
        /** `system` follows the phone between dark and light. */
        defaultScheme: z.enum(['system', ...SCHEME_NAMES]),
        /** The schemes a driver may pick in Settings. */
        schemes: z.array(z.enum(SCHEME_NAMES)).min(1).max(4),
        /** Off: Settings hides the theme picker and the app always uses `defaultScheme`. */
        allowUserToggle: z.boolean(),
    })
    .partial()
    .strict();

const FontWeight = z.enum(['400', '500', '600', '700', '800']);

/**
 * A bundled font family: per weight, the font file's PostScript name (the file in
 * brand/fonts is named after it, e.g. `PlusJakartaSans-Bold.ttf`). Weights the
 * family doesn't name use the nearest one it does.
 */
export const FontFamilySchema = z
    .object({
        faces: z
            .record(FontWeight, z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, 'Expected a PostScript font name'))
            .refine((faces) => Object.keys(faces).length > 0, 'At least one face is required'),
    })
    .strict();

export const TypographySchema = z
    .object({
        /** Body text and everything that doesn't name a font. */
        body: FontFamilySchema,
        /** Display, title and heading text (defaults to the body font). */
        heading: FontFamilySchema,
        /** Identifiers: tracking numbers, IDs, coordinates. Keep it monospaced. */
        mono: FontFamilySchema,
        /** Multiplies the type scale (0.9–1.2); 1 keeps the design's sizes. The glanceable tier is not scaled. */
        scale: z.number().min(0.9).max(1.2),
    })
    .partial()
    .strict();

export const ShapeSchema = z
    .object({
        radius: z
            .object({
                /** Chips, inputs, small cards (design: 10). */
                compact: z.number().int().min(0).max(20),
                /** Hero cards, sheets, map overlays (design: 18). */
                hero: z.number().int().min(0).max(32),
            })
            .partial()
            .strict(),
    })
    .partial()
    .strict();

/** An https URL. Bundled artwork goes in brand/ by file name instead (brand/logo.png). */
export const AssetRef = z.object({ url: z.string().url().max(2048).startsWith('https://') }).strict();

export const AssetsSchema = z
    .object({
        /** The sign-in logo. Unset uses brand/logo.png when present; `null` shows none. */
        logo: AssetRef.nullable(),
    })
    .partial()
    .strict();

export const BootSchema = z
    .object({
        /** The launch screen's background (scripts/generate-app-assets.js), and the colour behind the app while it starts. */
        background: BrandHex,
    })
    .partial()
    .strict();

/** A core tab, or a custom tab registered in the build's extensions (e.g. `RewardsTab`). */
const TabName = z.union([z.enum(CORE_TABS), z.string().regex(CUSTOM_TAB_NAME, 'Expected a core tab or a custom tab name ending in "Tab"')]);

export const NavigationSchema = z
    .object({
        /** The tabs, in order. Account is always kept — sign-out and settings live there. */
        tabs: z.array(TabName).min(1).max(5),
        /** The tab the app opens on. */
        defaultTab: TabName,
        /** Per core tab: another icon from the set, or a label translation key. */
        tabOverrides: z.record(z.enum(CORE_TABS), z.object({ icon: z.enum(TAB_ICONS), labelKey: z.string().min(1).max(80) }).partial().strict()),
    })
    .partial()
    .strict();

/** Account menu route names, e.g. `FuelLog`, `Inspection`. */
const RouteName = z.string().regex(/^[A-Z][A-Za-z0-9]{0,47}$/, 'Expected a route name');

export const AccountSchema = z
    .object({
        /** Account menu entries to hide, by route name. Settings and Help cannot be hidden. */
        hiddenLinks: z.array(RouteName).max(20),
    })
    .partial()
    .strict();

export const FeaturesSchema = z
    .object({
        /** Driver wallet earnings (ledger extension). Off shows the honest "not enabled" state. */
        earnings: z.boolean(),
    })
    .partial()
    .strict();

/**
 * Custom statuses from FleetOps order configs, mapped onto the design's tones so
 * they keep a glyph and marker shape (never colour alone). Keys are normalised
 * statuses (`awaiting_customs`); labels are translation keys.
 */
export const StatusesSchema = z
    .record(z.string().regex(/^[a-z0-9_]{1,60}$/, 'Expected a snake_case status'), z.object({ tone: z.enum(STATUS_TONES), labelKey: z.string().min(1).max(80) }).partial({ labelKey: true }).strict())
    .refine((value) => Object.keys(value).length <= 100, 'At most 100 statuses');

export const ScreensSchema = z.record(z.enum(SCREEN_IDS), z.object({ variant: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/) }).strict());

export const BRANDING_SECTIONS = {
    colors: ColorsSchema,
    appearance: AppearanceSchema,
    typography: TypographySchema,
    shape: ShapeSchema,
    assets: AssetsSchema,
    boot: BootSchema,
    navigation: NavigationSchema,
    account: AccountSchema,
    features: FeaturesSchema,
    statuses: StatusesSchema,
    screens: ScreensSchema,
} as const;

export type BrandingSection = keyof typeof BRANDING_SECTIONS;

export type BrandingColors = z.infer<typeof ColorsSchema>;
export type BrandingAppearance = z.infer<typeof AppearanceSchema>;
export type BrandingTypography = z.infer<typeof TypographySchema>;
export type BrandingShape = z.infer<typeof ShapeSchema>;
export type BrandingAssets = z.infer<typeof AssetsSchema>;
export type BrandingBoot = z.infer<typeof BootSchema>;
export type BrandingNavigation = z.infer<typeof NavigationSchema>;
export type BrandingAccount = z.infer<typeof AccountSchema>;
export type BrandingFeatures = z.infer<typeof FeaturesSchema>;
export type BrandingStatuses = z.infer<typeof StatusesSchema>;
export type BrandingScreens = z.infer<typeof ScreensSchema>;
export type FontFamily = z.infer<typeof FontFamilySchema>;
export type AssetReference = z.infer<typeof AssetRef>;

/** Branding input from one source. Every section is optional and merges over lower-priority sources. */
export type BrandingConfig = {
    schemaVersion: typeof BRANDING_SCHEMA_VERSION;
    name?: string;
    colors?: BrandingColors;
    appearance?: BrandingAppearance;
    typography?: BrandingTypography;
    shape?: BrandingShape;
    assets?: BrandingAssets;
    boot?: BrandingBoot;
    navigation?: BrandingNavigation;
    account?: BrandingAccount;
    features?: BrandingFeatures;
    statuses?: BrandingStatuses;
    screens?: BrandingScreens;
};
