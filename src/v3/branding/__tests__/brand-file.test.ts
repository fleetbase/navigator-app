/**
 * A brand file reaches every module that builds from branding when it loads:
 * the themes, radii and type scale, fonts, the status registry and the default
 * scheme. Each test loads those modules fresh with a mocked brand file, the way
 * theme/__tests__/white-label.test.ts does with a mocked env.
 */
function withBrand<T>(brand: object, load: () => T, assets: object = {}): T {
    jest.resetModules();
    jest.doMock('../../generated/brand-config', () => ({ __esModule: true, BRAND_DIR: 'brand', default: { schemaVersion: 1, ...brand } }));
    jest.doMock('../../generated/brand-assets', () => ({ __esModule: true, brandFonts: [], logo: null, logoDark: null, ...assets }));
    return load();
}

afterEach(() => {
    jest.resetModules();
    jest.dontMock('../../generated/brand-config');
    jest.dontMock('../../generated/brand-assets');
});

describe('a brand file', () => {
    it('re-colours the themes, but never the night scheme', () => {
        const themes = withBrand({ colors: { primary: '#0FA36B', tokens: { dark: { background: '#08110D' } } } }, () => require('../../theme/themes').themes);
        expect(themes.dark.primary).toBe('#0FA36B');
        expect(themes.light.primary).toBe('#0FA36B');
        expect(themes.dark.background).toBe('#08110D');
        expect(themes.light.background).toBe('#F4F6F9');
        expect(themes.night.primary).toBe('#D98A3D');
    });

    it('wins over the legacy env', () => {
        jest.resetModules();
        jest.doMock('react-native-config', () => ({ NAVIGATOR_BRAND: 'red' }));
        const themes = withBrand({ colors: { preset: 'indigo' } }, () => require('../../theme/themes').themes);
        expect(themes.dark.primary).toBe('#6366F1');
        // Back to jest.setup.js's empty env (dontMock would load the native module).
        jest.doMock('react-native-config', () => ({}));
    });

    it('sets the radii and the type scale, leaving the glanceable tier alone', () => {
        const tokens = withBrand({ shape: { radius: { compact: 4, hero: 12 } }, typography: { scale: 1.2 } }, () => require('../../theme/tokens'));
        expect(tokens.radius.compact).toBe(4);
        expect(tokens.radius.hero).toBe(12);
        expect(tokens.type.body.size).toBe(Math.round(17 * 1.2));
        expect(tokens.glanceable.hero.size).toBe(56);
    });

    it('swaps the fonts for bundled brand faces, nearest weight where one is missing', () => {
        const { fontFaces } = withBrand(
            { typography: { body: { faces: { '400': 'Inter-Regular', '700': 'Inter-Bold' } } } },
            () => require('../../theme/fonts'),
            { brandFonts: ['Inter-Regular', 'Inter-Bold'] }
        );
        expect(fontFaces.ui[400]).toBe('Inter-Regular');
        expect(fontFaces.ui[600]).toBe('Inter-Bold');
        expect(fontFaces.heading[700]).toBe('Inter-Bold');
        expect(fontFaces.mono[400]).toBe('JetBrainsMono-Regular');
    });

    it('maps a custom status onto a design tone, keeping its glyph and shape', () => {
        const { describeStatus } = withBrand({ statuses: { awaiting_customs: { tone: 'on_hold', labelKey: 'Brand.customs' } } }, () => require('../../theme/status'));
        const status = describeStatus('Awaiting Customs');
        expect(status.tone).toBe('on_hold');
        expect(status.labelKey).toBe('Brand.customs');
        expect(status.defaultLabel).toBe('Awaiting Customs');
        expect(status.glyph).toBe(describeStatus('on_hold').glyph);
    });

    it('sets the default scheme, and can pin it', () => {
        const pinned = withBrand({ appearance: { defaultScheme: 'light', allowUserToggle: false } }, () => require('../../settings/settingsStore'));
        expect(pinned.DEFAULT_SETTINGS.theme).toBe('light');
        expect(pinned.resolveScheme('night', true)).toBe('light');

        const limited = withBrand({ appearance: { schemes: ['dark', 'light'] } }, () => require('../../settings/settingsStore'));
        expect(limited.resolveScheme('night', true)).toBe('dark');
        expect(limited.resolveScheme('light', true)).toBe('light');
        expect(limited.isOffered('sunlight')).toBe(false);
    });

    it('hides account entries but never Settings or Help', () => {
        const { accountLinks } = withBrand({ account: { hiddenLinks: ['FuelLog', 'Help'] } }, () => require('../../screens/AccountScreen'));
        const routes = accountLinks().map((link: { route: string }) => link.route);
        expect(routes).not.toContain('FuelLog');
        expect(routes).toContain('Help');
        expect(routes).toContain('Settings');
    });
});
