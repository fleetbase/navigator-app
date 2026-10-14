/**
 * Regression guard for the white-label bug.
 *
 * In v2, CUSTOM_COLORS / CUSTOM_COLORS_LIGHT / CUSTOM_COLORS_DARK were spread
 * into lightBase/darkBase *before* the semantic definitions (tamagui.config.ts
 * lines 130-131, 169-170), and flattenTailwindCssColorsObject landed last. Every
 * override was therefore silently discarded — the feature had never worked.
 *
 * These tests load the theme module fresh with a mocked env each time, so they
 * assert the composed output rather than the intent.
 */
function loadThemes(env: Record<string, string>) {
    jest.resetModules();
    jest.doMock('react-native-config', () => env);
    return require('../themes').themes;
}

afterEach(() => {
    jest.resetModules();
    jest.dontMock('react-native-config');
});

describe('white-label overrides', () => {
    it('lets CUSTOM_COLORS override a semantic token (the v2 bug)', () => {
        const themes = loadThemes({ CUSTOM_COLORS: 'background:#123456' });
        expect(themes.dark.background).toBe('#123456');
        expect(themes.light.background).toBe('#123456');
    });

    it('applies CUSTOM_COLORS_LIGHT only to light-mode schemes', () => {
        const themes = loadThemes({ CUSTOM_COLORS_LIGHT: 'surface:#ABCDEF' });
        expect(themes.light.surface).toBe('#ABCDEF');
        expect(themes.sunlight.surface).toBe('#ABCDEF');
        expect(themes.dark.surface).toBe('#121927');
    });

    it('applies CUSTOM_COLORS_DARK only to dark-mode schemes', () => {
        const themes = loadThemes({ CUSTOM_COLORS_DARK: 'surface:#001122' });
        expect(themes.dark.surface).toBe('#001122');
        expect(themes.night.surface).toBe('#001122');
        expect(themes.light.surface).toBe('#FFFFFF');
    });

    it('lets a per-scheme override beat a mode-wide one', () => {
        const themes = loadThemes({ CUSTOM_COLORS_DARK: 'surface:#001122', CUSTOM_COLORS_NIGHT: 'surface:#334455' });
        expect(themes.dark.surface).toBe('#001122');
        expect(themes.night.surface).toBe('#334455');
    });

    it('swaps the brand primary from a preset name', () => {
        const themes = loadThemes({ NAVIGATOR_BRAND: 'acme' });
        expect(themes.dark.primary).toBe('#0FA36B');
        expect(themes.sunlight.primary).toBe('#00754A');
    });

    it('honours the v2 APP_THEME accent so existing builds keep their colour', () => {
        const themes = loadThemes({ APP_THEME: 'green' });
        expect(themes.dark.primary).toBe('#22C55E');
    });

    it('accepts a raw brand hex', () => {
        const themes = loadThemes({ NAVIGATOR_BRAND_PRIMARY: '#FF00AA' });
        expect(themes.dark.primary).toBe('#FF00AA');
    });

    it('keeps night amber regardless of brand — night vision beats branding', () => {
        const themes = loadThemes({ NAVIGATOR_BRAND: 'acme', NAVIGATOR_BRAND_PRIMARY: '#FF00AA' });
        expect(themes.night.primary).toBe('#D98A3D');
    });
});
