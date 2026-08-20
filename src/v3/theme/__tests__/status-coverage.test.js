/**
 * Guards the status registry against drift.
 *
 * v2 mapped 38 status strings onto 6 Tailwind families with a `yellow`
 * catch-all, so every fuel-report status (Draft, Approved, Rejected, Revised…)
 * rendered as an identical yellow badge. This test fails if a status-bearing
 * enum value or a legacy `getColorFromStatus` case has no tone in the registry,
 * so that class of silent fallback cannot come back.
 *
 * Parses sources rather than importing them: the registry is TypeScript and the
 * enums are consumed by Babel, not tsc, so there is no compiled artifact to load.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const norm = (s) => s.trim().replace(/[\s-]+/g, '_').toLowerCase();

function registryKeys() {
    const src = read('src/v3/theme/status.ts');
    const body = src.slice(src.indexOf('const TONE_BY_STATUS'), src.indexOf('export const FALLBACK_TONE'));
    return new Set([...body.matchAll(/^\s{4}([a-z_]+):\s*'/gm)].map((m) => m[1]));
}

function enumBlock(name) {
    const src = read('src/constants/Enums.ts');
    const i = src.indexOf(`export const ${name} =`);
    if (i < 0) return [];
    return [...src.slice(i, src.indexOf('});', i)).matchAll(/'([^']+)'/g)].map((m) => norm(m[1]));
}

function legacySwitchCases() {
    const src = read('src/utils/format.js');
    const from = src.indexOf('export function getColorFromStatus');
    const block = src.slice(from, src.indexOf('\n}', from));
    return [...block.matchAll(/case '([^']+)'/g)].map((m) => norm(m[1]));
}

describe('v3 status registry', () => {
    const known = registryKeys();

    it('covers every status-bearing enum value', () => {
        // IssueType is deliberately excluded — it is a category rendered as
        // plain text, not a status badge.
        const statuses = [
            ...enumBlock('IssueStatus'),
            ...enumBlock('IssuePriority'),
            ...enumBlock('FuelReportStatus'),
            ...enumBlock('DriverFuelReportStatus'),
        ];
        const missing = [...new Set(statuses)].filter((s) => !known.has(s));
        expect(missing).toEqual([]);
    });

    it('covers every status the legacy colour switch handled', () => {
        const missing = [...new Set(legacySwitchCases())].filter((s) => !known.has(s));
        expect(missing).toEqual([]);
    });

    it('covers the 11 tones the design specifies', () => {
        const palette = read('src/v3/theme/palette.ts');
        const block = palette.slice(palette.indexOf('export const statusHues'), palette.indexOf('} satisfies Record<string, StatusHue>'));
        const tones = [...block.matchAll(/^\s{4}([a-z_]+):\s*\{/gm)].map((m) => m[1]);
        expect(tones).toHaveLength(11);
        // every tone must be reachable by at least one status string
        const src = read('src/v3/theme/status.ts');
        const used = new Set([...src.matchAll(/:\s*'([a-z_]+)',/g)].map((m) => m[1]));
        expect(tones.filter((t) => !used.has(t))).toEqual([]);
    });
});

describe('status labels', () => {
    it('uses the design wording rather than naive humanisation', () => {
        const src = read('src/v3/theme/palette.ts');
        const block = src.slice(src.indexOf('export const statusHues'), src.indexOf('} satisfies Record<string, StatusHue>'));
        // The case that motivated carrying labels at all.
        expect(block).toMatch(/driver_enroute:.*label: 'En route'/);
        expect(block).toMatch(/driver_assigned:.*label: 'Assigned'/);
        // every tone must declare one
        const tones = [...block.matchAll(/^\s{4}([a-z_]+):\s*\{/gm)].map((m) => m[1]);
        const labelled = [...block.matchAll(/label: '[^']+'/g)];
        expect(labelled).toHaveLength(tones.length);
    });
});
