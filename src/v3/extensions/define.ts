/**
 * The shape of a build's extensions file, and the helper that type-checks it.
 *
 * Kept free of runtime imports (types only), because brand/navigator.extensions.ts
 * imports it while the app is still loading its own modules.
 */
import type { ScreenErrorReporter, ScreenOverrides, ScreenVariantSelection } from './screens/types';
import type { ComponentOverrides } from './components/types';
import type { CustomRoutes, CustomTabs } from './navigation';

export const EXTENSIONS_SCHEMA_VERSION = 1 as const;

export type AccountMenuLink = {
    /** The route the entry opens. */
    route: string;
    /** A translation key for the entry's label (e.g. from brand/translations). */
    labelKey: string;
    /** Index into the menu (0 = first). Defaults to just before Settings. */
    position?: number;
};

export type NavigatorExtensions = {
    /** Version of this shape. Omitted means 1; a version the app doesn't know is ignored with a warning. */
    schemaVersion?: typeof EXTENSIONS_SCHEMA_VERSION;
    /** Compiled-in screen overrides keyed by stable screen id. */
    screens?: ScreenOverrides;
    /** Selects compiled-in screen variants by key (declarative; never loads code). */
    screenVariants?: ScreenVariantSelection;
    /** Compiled-in component overrides keyed by stable component id. */
    components?: ComponentOverrides;
    /** Screens the build adds, by route name; reachable with navigation.navigate(name). */
    routes?: CustomRoutes;
    /** Tabs the build adds, by tab name (ending in `Tab`); each opens one of `routes`. */
    tabs?: CustomTabs;
    /**
     * Entries the build adds to the Account menu. Each opens a route in the
     * Account stack: a custom route (whose `tabs` include Account, or omit `tabs`)
     * or a core one.
     */
    accountLinks?: AccountMenuLink[];
    /** Receives every screen, component or route failure the app recovered from (e.g. to report it). */
    onError?: ScreenErrorReporter;
};

/** Identity helper that type-checks a Navigator build's extensions. */
export function defineNavigatorExtensions(extensions: NavigatorExtensions): NavigatorExtensions {
    return extensions;
}
