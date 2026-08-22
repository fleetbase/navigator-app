/**
 * Guards the component library against untranslated copy creeping back.
 *
 * The library predates the i18n layer, so `OfflineBanner`, the offer card's
 * Accept/Decline, the HOS gauge's "DRIVE LEFT" and the stop-type chips all
 * shipped as English literals — invisible in every test, because the tests
 * asserted the same English back.
 *
 * Parses sources rather than rendering: a string only reachable in a state no
 * test exercises is exactly the one that survives.
 */
const fs = require('fs');
const path = require('path');

const UI = path.resolve(__dirname, '..');

function sourceFiles() {
    return fs
        .readdirSync(UI, { withFileTypes: true })
        .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
        .map((e) => path.join(UI, e.name));
}

/** Comments carry prose deliberately; only code counts. */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('component library copy', () => {
    it('renders no hardcoded sentence between JSX tags', () => {
        const offenders = [];
        for (const file of sourceFiles()) {
            const code = stripComments(fs.readFileSync(file, 'utf8'));
            for (const m of code.matchAll(/>\s*([A-Z][A-Za-z][^<>{}\n]{3,})\s*</g)) {
                offenders.push(`${path.basename(file)}: ${m[1].trim()}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('passes no hardcoded sentence to a text-bearing prop', () => {
        const offenders = [];
        for (const file of sourceFiles()) {
            const code = stripComments(fs.readFileSync(file, 'utf8'));
            for (const m of code.matchAll(/(?:message|title|body|label|placeholder|retryLabel)=\{?['"]([A-Z][^'"]{3,})['"]/g)) {
                offenders.push(`${path.basename(file)}: ${m[1].trim()}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('builds no plural by hand — pluralisation is the catalogue\'s job', () => {
        // `${n} ${n === 1 ? 'item' : 'items'}` is not translatable: languages
        // with more than two plural forms cannot be expressed that way.
        const offenders = [];
        for (const file of sourceFiles()) {
            const code = stripComments(fs.readFileSync(file, 'utf8'));
            for (const m of code.matchAll(/===\s*1\s*\?\s*'([a-z]+)'\s*:\s*'([a-z]+)'/g)) {
                offenders.push(`${path.basename(file)}: ${m[1]}/${m[2]}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});
