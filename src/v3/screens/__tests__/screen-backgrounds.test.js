/**
 * Guards every screen's root against painting the platform background instead
 * of the theme's.
 *
 * A bare `<ScrollView style={{ flex: 1 }}>` shows the platform default behind
 * its content. All twenty screens did that, so in dark, night and sunlight the
 * page stayed light wherever content did not cover it. It survived the entire
 * build because the simulator's system scheme is light — every "dark scheme"
 * screenshot was of a light app, and the unit tests render trees rather than
 * pixels.
 */
const fs = require('fs');
const path = require('path');

const SCREENS = path.resolve(__dirname, '..');

function screenFiles() {
    return fs
        .readdirSync(SCREENS, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.tsx'))
        .map((e) => path.join(SCREENS, e.name));
}

describe('screen roots', () => {
    it('never leaves a vertical ScrollView root unthemed', () => {
        const offenders = [];
        for (const file of screenFiles()) {
            const src = fs.readFileSync(file, 'utf8');
            for (const m of src.matchAll(/<ScrollView\b[\s\S]*?>/g)) {
                const tag = m[0];
                // Horizontal scrollers sit inside an already-themed parent.
                if (/\bhorizontal\b/.test(tag)) continue;
                if (!/style=\{screen\}/.test(tag)) {
                    offenders.push(`${path.basename(file)}: ${tag.replace(/\s+/g, ' ').slice(0, 70)}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it('uses the shared hook rather than a hand-rolled colour', () => {
        // One place to change, and it reads the token rather than a literal.
        const offenders = [];
        for (const file of screenFiles()) {
            const src = fs.readFileSync(file, 'utf8');
            if (src.includes('style={screen}') && !src.includes('useScreenStyle')) {
                offenders.push(path.basename(file));
            }
        }
        expect(offenders).toEqual([]);
    });
});
