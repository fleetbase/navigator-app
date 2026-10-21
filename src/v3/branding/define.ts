import type { BrandingConfig } from './schema';

/**
 * Identity helper that type-checks a Navigator build's branding
 * (brand/navigator.brand.ts). Types only, so the brand file can import it while
 * the app is still loading its own modules.
 */
export function defineBranding(config: BrandingConfig): BrandingConfig {
    return config;
}
