import { resolveBranding } from '../resolve';
import { brandingFromLegacyEnv } from '../legacy-env';
import { DEFAULT_BRANDING } from '../defaults';

const resolve = (...configs: unknown[]) => resolveBranding(configs.map((config, i) => ({ name: `source${i}`, config })));

describe('resolveBranding', () => {
    it('resolves to the Waypoint design with no branding at all', () => {
        const { branding, issues } = resolve();
        expect(issues).toEqual([]);
        expect(branding.colors).toMatchObject({ preset: 'fleetbase', primary: '#3D7BFA', primaryDeep: '#2E63D9', onPrimary: '#FFFFFF', sunlightPrimary: '#0040DD' });
        expect(branding.appearance).toEqual({ defaultScheme: 'system', schemes: ['dark', 'light', 'sunlight', 'night'], allowUserToggle: true });
        expect(branding.navigation.tabs).toEqual(['Today', 'Route', 'Orders', 'Inbox', 'Account']);
        expect(branding.shape.radius).toEqual({ compact: 10, hero: 18 });
        expect(branding.typography.scale).toBe(1);
        expect(branding.boot.background).toBe('#0B1017');
        expect(branding.features.earnings).toBe(false);
    });

    it('layers sources in priority order', () => {
        const { branding } = resolve({ schemaVersion: 1, colors: { preset: 'red' }, shape: { radius: { compact: 6 } } }, { schemaVersion: 1, shape: { radius: { hero: 24 } } });
        expect(branding.colors.primary).toBe('#EF4444');
        expect(branding.shape.radius).toEqual({ compact: 6, hero: 24 });
    });

    it('drops only the invalid value, with an issue naming it', () => {
        const { branding, issues } = resolve({ schemaVersion: 1, colors: { primary: 'teal', preset: 'green' }, shape: { radius: { compact: 99 } } });
        expect(branding.colors.preset).toBe('green');
        expect(branding.colors.primary).toBe('#22C55E');
        expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(['colors.primary', 'shape.radius.compact']));
    });

    it('rejects a whole source with an unsupported schema version, and reports unknown sections', () => {
        expect(resolve({ schemaVersion: 2, colors: { preset: 'red' } }).branding.colors.preset).toBe('fleetbase');
        expect(resolve({ schemaVersion: 2 }).issues[0].path).toBe('schemaVersion');
        expect(resolve({ schemaVersion: 1, logo: 'x' }).issues).toEqual([expect.objectContaining({ path: 'logo', message: 'Unknown section' })]);
    });

    it('derives the deep, on-colour and sunlight steps from a custom primary', () => {
        const { branding } = resolve({ schemaVersion: 1, colors: { primary: '#0FA36B' } });
        expect(branding.colors.primary).toBe('#0FA36B');
        expect(branding.colors.primaryDeep).not.toBe('#2E63D9');
        // Sunlight needs 4.5:1 on white; the brand green alone does not have it.
        const { contrastRatio } = require('../color');
        expect(contrastRatio(branding.colors.sunlightPrimary, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    });

    it('reports unreadable colours, and reverts them for a source that must not ship them', () => {
        const report = resolve({ schemaVersion: 1, colors: { tokens: { dark: { textPrimary: '#121927' } } } });
        expect(report.issues.some((i) => i.path === 'colors.dark.textPrimary/background')).toBe(true);
        expect(report.branding.colors.tokens.dark.textPrimary).toBe('#121927');

        const enforced = resolveBranding([{ name: 'preview', config: { schemaVersion: 1, colors: { tokens: { dark: { textPrimary: '#121927' } } } }, enforceContrast: true }]);
        expect(enforced.branding.colors.tokens.dark.textPrimary).toBeUndefined();
        expect(enforced.issues[0].message).toMatch(/reverted/);
    });

    it('layers token overrides all → mode → scheme', () => {
        const { branding } = resolve({ schemaVersion: 1, colors: { tokens: { all: { surface: '#111111' }, darkModes: { surface: '#222222' }, night: { surface: '#333333' } } } });
        expect(branding.colors.tokens.light.surface).toBe('#111111');
        expect(branding.colors.tokens.dark.surface).toBe('#222222');
        expect(branding.colors.tokens.night.surface).toBe('#333333');
    });

    it('falls back when the default scheme is not offered', () => {
        const { branding, issues } = resolve({ schemaVersion: 1, appearance: { schemes: ['light', 'sunlight'], defaultScheme: 'dark' } });
        expect(branding.appearance.defaultScheme).toBe('light');
        expect(issues[0].path).toBe('appearance.defaultScheme');
    });

    it('always keeps Account, Settings and Help', () => {
        const { branding, issues } = resolve({ schemaVersion: 1, navigation: { tabs: ['Today', 'Orders'] }, account: { hiddenLinks: ['FuelLog', 'Settings'] } });
        expect(branding.navigation.tabs).toEqual(['Today', 'Orders', 'Account']);
        expect(branding.account.hiddenLinks).toEqual(['FuelLog']);
        expect(issues.map((i) => i.path)).toEqual(['navigation.tabs', 'account.hiddenLinks']);
    });

    it('drops a font family whose files are not bundled', () => {
        const family = { faces: { '400': 'Inter-Regular' } };
        expect(resolveBranding([{ name: 'b', config: { schemaVersion: 1, typography: { body: family } } }], { fonts: ['Inter-Regular'] }).branding.typography.body).toEqual(family);
        const missing = resolveBranding([{ name: 'b', config: { schemaVersion: 1, typography: { body: family } } }]);
        expect(missing.branding.typography.body).toBeUndefined();
        expect(missing.issues[0].message).toMatch(/Inter-Regular/);
    });

    it('accepts custom statuses on the design tones and screen variants', () => {
        const { branding, issues } = resolve({ schemaVersion: 1, statuses: { awaiting_customs: { tone: 'on_hold' } }, screens: { 'order.detail': { variant: 'compact' } } });
        expect(issues).toEqual([]);
        expect(branding.statuses.awaiting_customs.tone).toBe('on_hold');
        expect(resolve({ schemaVersion: 1, statuses: { x: { tone: 'purple' } } }).issues.length).toBeGreaterThan(0);
    });

    it('does not mutate the defaults', () => {
        resolve({ schemaVersion: 1, navigation: { tabs: ['Today'] }, colors: { tokens: { all: { surface: '#111111' } } } });
        expect(DEFAULT_BRANDING.navigation.tabs).toEqual(['Today', 'Route', 'Orders', 'Inbox', 'Account']);
        expect(DEFAULT_BRANDING.colors.tokens).toEqual({});
    });
});

describe('brandingFromLegacyEnv', () => {
    const env = (values: Record<string, string>) => brandingFromLegacyEnv((key) => values[key]);

    it('is empty without legacy keys', () => {
        expect(env({})).toEqual({ schemaVersion: 1 });
    });

    it('maps the preset, NAVIGATOR_BRAND over the v2 APP_THEME', () => {
        expect(env({ APP_THEME: 'green' }).colors?.preset).toBe('green');
        expect(env({ APP_THEME: 'green', NAVIGATOR_BRAND: 'Acme' }).colors?.preset).toBe('acme');
        expect(env({ NAVIGATOR_BRAND: 'unknown' }).colors).toBeUndefined();
    });

    it('keeps the old raw-primary behaviour: primary and sunlight replaced, deep and on-colour from the preset', () => {
        expect(env({ NAVIGATOR_BRAND_PRIMARY: '#FF00AA', NAVIGATOR_BRAND: 'red' }).colors).toEqual({
            preset: 'red',
            primary: '#FF00AA',
            sunlightPrimary: '#FF00AA',
            primaryDeep: '#B91C1C',
            onPrimary: '#FFFFFF',
        });
    });

    it('maps CUSTOM_COLORS* to token overrides and FEATURE_EARNINGS to the feature', () => {
        const config = env({ CUSTOM_COLORS: 'background:#123456', CUSTOM_COLORS_DARK: 'surface:#001122', CUSTOM_COLORS_NIGHT: 'surface:#334455', FEATURE_EARNINGS: 'true' });
        expect(config.colors?.tokens).toEqual({ all: { background: '#123456' }, darkModes: { surface: '#001122' }, night: { surface: '#334455' } });
        expect(config.features).toEqual({ earnings: true });
    });
});
