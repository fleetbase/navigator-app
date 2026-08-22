import { statusHues, schemePalettes, contrastRatio, legibleOn, AA_CONTRAST } from '../palette';
import { themes } from '../themes';
import { SCHEMES, type SchemeName } from '../palette';

/**
 * Status text used the full-strength hue on every scheme. The hues were
 * authored against dark grounds and reused unchanged on light and sunlight,
 * where all eleven failed WCAG AA — 3.91 down to 1.78 for `on_hold`. Sunlight
 * is the scheme for reading in direct sun, so it was the worst place to lose it.
 *
 * These assert the *resolved theme tokens*, not the source hues, because the
 * source hues are exactly what looked fine and was not.
 */
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

describe('status text contrast', () => {
    it.each(SCHEMES)('clears WCAG AA for every status in the %s scheme', (scheme: SchemeName) => {
        const theme = (themes as Record<string, Record<string, string>>)[scheme];
        const surface = schemePalettes[scheme].surface;

        const failures: string[] = [];
        for (const key of Object.keys(statusHues)) {
            const token = theme[`${camel(key)}Text`];
            const ratio = contrastRatio(token, surface);
            if (ratio < AA_CONTRAST) failures.push(`${key}: ${ratio.toFixed(2)}`);
        }
        expect(failures).toEqual([]);
    });

    it('leaves a hue untouched when it already passes', () => {
        // Only lightness moves, and only where it must.
        const darkSurface = schemePalettes.dark.surface;
        const passing = statusHues.driver_enroute.hue;
        expect(contrastRatio(passing, darkSurface)).toBeGreaterThanOrEqual(AA_CONTRAST);
        expect(legibleOn(passing, darkSurface)).toBe(passing);
    });

    it('darkens rather than abandons the hue on a light ground', () => {
        const white = '#FFFFFF';
        const original = statusHues.on_hold.hue;
        const adjusted = legibleOn(original, white);

        expect(adjusted).not.toBe(original);
        expect(contrastRatio(adjusted, white)).toBeGreaterThanOrEqual(AA_CONTRAST);
        // Still recognisably the same colour family, not a fallback to black.
        expect(adjusted).not.toBe('#000000');
    });

    it('keeps fill and border on the original hue', () => {
        // A 12% tint is decoration; only text carries the contrast requirement.
        const theme = (themes as Record<string, Record<string, string>>).sunlight;
        expect(String(theme.onHoldFill).toLowerCase()).toContain(statusHues.on_hold.hue.slice(1).toLowerCase());
    });
});
