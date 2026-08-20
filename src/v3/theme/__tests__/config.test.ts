/**
 * Proves the Waypoint config actually builds and that every scheme carries the
 * full token set. The v2 theme layer silently dropped env overrides for years
 * because nothing asserted the composed result.
 */
import config, { themes, SCHEMES } from '../index';
import { describeStatus } from '../status';
import { schemePalettes } from '../palette';

describe('waypoint config', () => {
    it('builds a Tamagui config with the four schemes', () => {
        expect(config).toBeTruthy();
        expect(Object.keys(config.themes).sort()).toEqual(['dark', 'light', 'night', 'sunlight']);
    });

    it('gives every scheme the full structural token set', () => {
        const required = [
            'background', 'surface', 'surfaceRaised', 'border', 'shadowColor',
            'textPrimary', 'textSecondary', 'textMuted',
            'primary', 'primaryDeep', 'onPrimary', 'primaryFill', 'primaryBorder', 'primaryGlow',
            'mapBackground', 'mapLine',
        ];
        for (const scheme of SCHEMES) {
            const missing = required.filter((k) => !(k in themes[scheme]));
            expect({ scheme, missing }).toEqual({ scheme, missing: [] });
        }
    });

    it('resolves every status token the registry points at, in every scheme', () => {
        // This is the check that ends isDarkMode branching: if a status token
        // were missing from one scheme, components would fall back to hardcoding.
        const statuses = ['created', 'driver_enroute', 'completed', 'failed', 'on_hold', 'Pending Approval', 'In Progress'];
        for (const scheme of SCHEMES) {
            for (const s of statuses) {
                const d = describeStatus(s);
                for (const token of [d.fillToken, d.borderToken, d.textToken]) {
                    const key = token.slice(1); // strip $
                    expect({ scheme, s, token, present: key in themes[scheme] }).toEqual({ scheme, s, token, present: true });
                }
            }
        }
    });

    it('matches the design document hex values exactly', () => {
        expect(themes.dark.background).toBe('#0B1017');
        expect(themes.dark.surface).toBe('#121927');
        expect(themes.dark.textPrimary).toBe('#F2F5F9');
        expect(themes.light.background).toBe('#F4F6F9');
        expect(themes.sunlight.textPrimary).toBe('#000000');
        expect(themes.night.background).toBe('#0C0906');
        // Night overrides the brand to amber regardless of build brand.
        expect(themes.night.primary).toBe('#D98A3D');
    });

    it('uses zIndex token keys Tamagui accepts', () => {
        // createTamagui validates tokens.zIndex against $0-$7/$true and throws
        // at runtime — but only on native, so semantic keys passed jest and
        // crashed the app on launch. Assert the shape directly.
        const allowed = new Set(['0', '1', '2', '3', '4', '5', '6', '7', 'true']);
        const keys = Object.keys(config.tokens.zIndex ?? {}).map((k) => k.replace(/^\$/, ''));
        expect(keys.length).toBeGreaterThan(0);
        expect(keys.filter((k) => !allowed.has(k))).toEqual([]);
    });

    it('marks dark and night as dark schemes', () => {
        expect(schemePalettes.dark.isDark).toBe(true);
        expect(schemePalettes.night.isDark).toBe(true);
        expect(schemePalettes.light.isDark).toBe(false);
        expect(schemePalettes.sunlight.isDark).toBe(false);
    });
});
