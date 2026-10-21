/**
 * CI guard for the build's own brand/ files (or the root templates upstream).
 *
 * Branding resolves forgivingly at runtime — a bad value is dropped and the app
 * carries on — so a typo in brand/navigator.brand.ts would otherwise ship
 * silently. Here every issue fails the build instead.
 */
import { resolveBranding, getBuildBrandingSources } from '../index';
import { brandFonts } from '../../generated/brand-assets';

describe('the bundled branding', () => {
    it('resolves without a single issue', () => {
        const sources = getBuildBrandingSources().filter((source) => source.name !== 'preview');
        expect(resolveBranding(sources, { fonts: brandFonts }).issues).toEqual([]);
    });
});

describe('the bundled extensions', () => {
    it('validate: known screen and component ids, routes, tabs and account entries', () => {
        // Each throws on an invalid entry when strict (as in development).
        const { getBuildExtensions } = require('../../extensions/build-extensions');
        const { createScreenRegistry } = require('../../extensions/screens/registry');
        const { defaultScreens } = require('../../extensions/screens/default-screens');
        const { validateComponentOverrides } = require('../../extensions/components/component-slot');
        const { validateCustomNavigation } = require('../../extensions/navigation');
        const { CORE_ROUTES } = require('../../extensions/build-navigation');
        const extensions = getBuildExtensions();
        expect(() => createScreenRegistry(extensions.screens ?? {}, { defaults: defaultScreens, strict: true })).not.toThrow();
        expect(() => validateComponentOverrides(extensions.components, { strict: true })).not.toThrow();
        expect(() => validateCustomNavigation(extensions.routes, extensions.tabs, { coreRoutes: CORE_ROUTES, strict: true })).not.toThrow();
        expect(() => require('../../extensions/build-navigation')).not.toThrow();
    });
});
