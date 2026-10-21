import { parseConfigObjectString } from '../../utils/tamagui';
import { brandPresets, SCHEMES } from '../theme/palette';
import type { BrandingConfig } from './schema';

/**
 * The `.env` keys that branded the app before navigator.brand.ts existed, so
 * builds configured that way keep their look. The brand file overrides them.
 */
export const LEGACY_BRANDING_ENV_KEYS = [
    'NAVIGATOR_BRAND',
    'APP_THEME',
    'NAVIGATOR_BRAND_PRIMARY',
    'CUSTOM_COLORS',
    'CUSTOM_COLORS_LIGHT',
    'CUSTOM_COLORS_DARK',
    'CUSTOM_COLORS_SUNLIGHT',
    'CUSTOM_COLORS_NIGHT',
    'FEATURE_EARNINGS',
] as const;

type ReadEnv = (key: string) => unknown;

const present = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const toBoolean = (value: unknown) => value === true || (typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()));

function tokens(value: unknown): Record<string, string> | undefined {
    if (!present(value)) return undefined;
    const parsed = parseConfigObjectString(value) as Record<string, string>;
    return parsed && Object.keys(parsed).length ? parsed : undefined;
}

/**
 * Maps the legacy env to a branding source.
 *
 * Mirrors what theme/themes.ts did with these keys before the brand file: the
 * preset comes from NAVIGATOR_BRAND, else the v2 APP_THEME; a raw
 * NAVIGATOR_BRAND_PRIMARY replaces the primary *and* the sunlight primary and
 * keeps the preset's deep and on-primary colours; CUSTOM_COLORS* override
 * tokens shared, per mode (light/sunlight or dark/night), then per scheme.
 */
export function brandingFromLegacyEnv(read: ReadEnv): BrandingConfig {
    const config: BrandingConfig = { schemaVersion: 1 };
    const colors: NonNullable<BrandingConfig['colors']> = {};

    const presetName = present(read('NAVIGATOR_BRAND')) ? read('NAVIGATOR_BRAND') : read('APP_THEME');
    const presetKey = present(presetName) ? presetName.trim().toLowerCase() : undefined;
    if (presetKey && brandPresets[presetKey]) colors.preset = presetKey;

    const primary = read('NAVIGATOR_BRAND_PRIMARY');
    if (present(primary) && /^#[0-9a-f]{6}$/i.test(primary)) {
        const preset = brandPresets[colors.preset ?? 'fleetbase'];
        colors.primary = primary;
        colors.sunlightPrimary = primary;
        colors.primaryDeep = preset.primaryDeep;
        colors.onPrimary = preset.onPrimary;
    }

    const tokenOverrides: NonNullable<NonNullable<BrandingConfig['colors']>['tokens']> = {};
    const all = tokens(read('CUSTOM_COLORS'));
    const light = tokens(read('CUSTOM_COLORS_LIGHT'));
    const dark = tokens(read('CUSTOM_COLORS_DARK'));
    if (all) tokenOverrides.all = all;
    if (light) tokenOverrides.lightModes = light;
    if (dark) tokenOverrides.darkModes = dark;
    // CUSTOM_COLORS_DARK / _LIGHT are already the mode-wide keys; only night and
    // sunlight have a key of their own.
    for (const scheme of SCHEMES.filter((name) => name !== 'dark' && name !== 'light')) {
        const perScheme = tokens(read(`CUSTOM_COLORS_${scheme.toUpperCase()}`));
        if (perScheme) tokenOverrides[scheme] = perScheme;
    }
    if (Object.keys(tokenOverrides).length) colors.tokens = tokenOverrides;

    if (Object.keys(colors).length) config.colors = colors;

    const earnings = read('FEATURE_EARNINGS');
    if (earnings !== undefined && earnings !== null && earnings !== '') config.features = { earnings: toBoolean(earnings) };

    return config;
}
