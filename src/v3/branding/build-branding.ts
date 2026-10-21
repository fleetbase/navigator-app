import buildBrand from '../generated/brand-config';
import { brandFonts } from '../generated/brand-assets';
import { config as readEnv } from '../../utils/tamagui';
import { readJSON } from '../api/storage';
import { brandingFromLegacyEnv } from './legacy-env';
import { resolveBranding } from './resolve';
import type { BrandingIssue, BrandingSource, ResolvedBranding } from './resolve';

/** MMKV key a development build reads a branding preview from (a branding config, as JSON). */
export const BRANDING_PREVIEW_KEY = 'v3.branding-preview';

/**
 * Branding sources known when the app starts, lowest priority first. A remote,
 * published configuration will be layered on top in a later release.
 */
export function getBuildBrandingSources(): BrandingSource[] {
    const sources: BrandingSource[] = [
        { name: 'legacy-env', config: brandingFromLegacyEnv((key) => readEnv(key, undefined)) },
        { name: 'navigator.brand.ts', config: buildBrand },
    ];
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // Development only: try a look without rebuilding. Unreadable colours are
        // reverted rather than shipped, since nobody reviewed this source.
        const preview = readJSON<unknown>(BRANDING_PREVIEW_KEY, null);
        if (preview) sources.push({ name: 'preview', config: preview, enforceContrast: true });
    }
    return sources;
}

let cached: { branding: ResolvedBranding; issues: BrandingIssue[] } | null = null;

/**
 * Resolved branding for this build. Read once: the theme, fonts and tokens are
 * built from it when their modules load, so it cannot change while the app runs.
 */
export function getBuildBranding() {
    if (cached) return cached;
    cached = resolveBranding(getBuildBrandingSources(), { fonts: brandFonts });
    if (typeof __DEV__ !== 'undefined' && __DEV__ && cached.issues.length && process.env.NODE_ENV !== 'test') {
        console.warn(`[branding] ${cached.issues.length} issue(s):\n${cached.issues.map((i) => `  ${i.source} ${i.path}: ${i.message}`).join('\n')}`);
    }
    return cached;
}

/** The resolved branding. A plain value — branding is fixed for the life of the app. */
export const useBranding = (): ResolvedBranding => getBuildBranding().branding;
