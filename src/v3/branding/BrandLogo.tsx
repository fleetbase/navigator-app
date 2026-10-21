import { Image, type ImageSourcePropType } from 'react-native';
import { logo, logoDark } from '../generated/brand-assets';
import { useResolvedScheme } from '../settings/useSettings';
import { isDarkScheme } from '../theme/themes';
import { getBuildBranding } from './build-branding';

/**
 * The build's logo: branding `assets.logo` (an https URL; `null` hides it), else
 * brand/logo.png — with brand/logo-dark.png on the dark schemes when there is one.
 */
export function brandLogoSource(dark: boolean): ImageSourcePropType | null {
    const configured = getBuildBranding().branding.assets.logo;
    if (configured === null) return null;
    if (configured?.url) return { uri: configured.url };
    const bundled = dark ? (logoDark ?? logo) : logo;
    return bundled ?? null;
}

/** Renders the build's logo, or nothing when the build has none. */
export function BrandLogo({ height = 40, maxWidth = 200, testID = 'brand-logo' }: { height?: number; maxWidth?: number; testID?: string }) {
    const source = brandLogoSource(isDarkScheme(useResolvedScheme()));
    if (!source) return null;
    return <Image source={source} style={{ height, width: maxWidth, maxWidth }} resizeMode="contain" accessibilityIgnoresInvertColors testID={testID} />;
}
