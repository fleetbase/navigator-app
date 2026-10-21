import { SCHEMES } from '../theme/palette';
import { CORE_TABS } from '../extensions/tabs';

/**
 * What the app looks like with no branding at all — the Waypoint design as
 * shipped. Every resolved value starts here.
 */
export const DEFAULT_BRANDING = {
    schemaVersion: 1 as const,
    name: undefined as string | undefined,
    colors: { preset: 'fleetbase', tokens: {} as Record<string, Record<string, string>> },
    appearance: { defaultScheme: 'system', schemes: [...SCHEMES], allowUserToggle: true },
    typography: { scale: 1 },
    shape: { radius: { compact: 10, hero: 18 } },
    assets: {} as { logo?: { url: string } | null },
    boot: { background: '#0B1017' },
    navigation: { tabs: [...CORE_TABS] as string[], defaultTab: 'Today', tabOverrides: {} },
    account: { hiddenLinks: [] as string[] },
    features: { earnings: false },
    statuses: {},
    screens: {},
};
