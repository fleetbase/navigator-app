import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { DEFAULT_SCREEN_MODULES, defaultScreens } from '../screens/default-screens';
import { SCREEN_IDS } from '../screens/screen-ids';
import { CORE_ROUTES } from '../build-navigation';

const V3 = join(__dirname, '..', '..');
const NAVIGATION = join(V3, 'navigation');

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === 'routes' ? [] : sourceFiles(path);
        return /\.(t|j)sx?$/.test(entry.name) ? [path] : [];
    });

/**
 * The guarantee that makes screen overrides work: navigators never import an
 * overridable screen, they register `screenSlot(id)`. The protected modules are
 * derived from the registry's own defaults, so a screen added to it is covered
 * without anyone remembering to update a list.
 */
describe('navigation boundary', () => {
    it('has a default for every screen id, and nothing else', () => {
        expect(Object.keys(defaultScreens).sort()).toEqual([...SCREEN_IDS].sort());
    });

    it('never imports a default screen module or an overridable screen from a navigator', () => {
        const overridableScreens = readdirSync(join(V3, 'navigation', 'routes'))
            .filter((file) => file !== 'fixed.tsx')
            .flatMap((file) => [...readFileSync(join(V3, 'navigation', 'routes', file), 'utf8').matchAll(/from '\.\.\/\.\.\/screens\/(\w+)'/g)].map((m) => m[1]));
        expect(overridableScreens.length).toBeGreaterThan(30);

        const violations: string[] = [];
        for (const file of sourceFiles(NAVIGATION)) {
            const source = readFileSync(file, 'utf8');
            for (const [, target] of source.matchAll(/from '([^']+)'/g)) {
                const normalised = target.replace(/^\.\//, 'navigation/').replace(/^\.\.\//, '');
                if (DEFAULT_SCREEN_MODULES.some((module) => normalised === module || normalised === module.replace('navigation/', ''))) {
                    violations.push(`${relative(V3, file)} imports ${target}`);
                }
                const screen = target.match(/screens\/(\w+)$/)?.[1];
                if (screen && overridableScreens.includes(screen)) violations.push(`${relative(V3, file)} imports ${target}`);
            }
        }
        expect(violations).toEqual([]);
    });

    it('lists every route DriverTabs registers as a core route', () => {
        const source = readFileSync(join(NAVIGATION, 'DriverTabs.tsx'), 'utf8');
        const registered = [...source.matchAll(/<Stack\.Screen name="(\w+)"/g)].map((m) => m[1]);
        expect([...new Set(registered)].sort()).toEqual([...new Set([...CORE_ROUTES, 'NavigationHandoff'])].sort());
    });
});

/** The contract tables in docs/extensibility.md must list every id the code has. */
describe('docs/extensibility.md', () => {
    const docs = readFileSync(join(V3, '..', '..', 'docs', 'extensibility.md'), 'utf8');
    const { COMPONENT_IDS } = require('../components/component-ids');

    it.each([...SCREEN_IDS])('documents the screen id %s', (id) => {
        expect(docs).toContain(`| \`${id}\` |`);
    });

    it.each([...COMPONENT_IDS])('documents the component id %s', (id) => {
        expect(docs).toContain(`| \`${id}\` |`);
    });
});
