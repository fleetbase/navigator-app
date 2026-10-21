/**
 * Branding must change nothing for a build that doesn't use it.
 *
 * The fixture is the theme, font and token output captured from the theme
 * modules *before* they read branding (when they read the env directly). With
 * no brand file and no legacy env keys, the branded pipeline has to reproduce it
 * key for key and value for value.
 */
import fixture from './__fixtures__/waypoint-themes.json';

describe('theme parity', () => {
    const { themes } = require('../themes');
    const { fonts } = require('../fonts');
    const { radius, type } = require('../tokens');

    it('reproduces every theme token in every scheme', () => {
        expect(JSON.parse(JSON.stringify(themes))).toEqual(fixture.themes);
    });

    it('reproduces the fonts, radii and type scale', () => {
        expect(JSON.parse(JSON.stringify(fonts))).toEqual(fixture.fonts);
        expect(radius).toEqual(fixture.radius);
        expect(type).toEqual(fixture.type);
    });
});
