import React, { Suspense } from 'react';
import { createLoadable } from './screens/loadable';
import ScreenErrorBoundary from './screens/ScreenErrorBoundary';
import { ScreenLoadError, ScreenLoading } from './screens/ScreenFallbacks';
import { withHeader } from '../navigation/withHeader';
import type { LoadableComponent } from './screens/types';

import { CORE_TABS, CUSTOM_TAB_NAME } from './tabs';

export { CORE_TABS, type CoreTab } from './tabs';

/** A screen a build adds to the app, reachable with `navigation.navigate(name, params)`. */
export type CustomRoute = {
    /** Loads the screen: `() => import('./screens/RewardsScreen')`. */
    load: () => Promise<{ default: React.ComponentType<any> } | React.ComponentType<any>>;
    /** `card` (default) pushes the screen; `modal` presents it over the current one. */
    presentation?: 'card' | 'modal';
    /**
     * A translation key for the title bar. With one, the screen gets the app's
     * title bar and back control; without one it draws its own.
     */
    titleKey?: string;
    /**
     * The stacks the route is added to: core tabs (`'Account'`) and custom tab
     * names. Defaults to every stack. `navigate` resolves within the current
     * stack, so list every tab the route is opened from.
     */
    tabs?: string[];
};

export type TabIconRenderer = (props: { color: string; size: number; focused: boolean }) => React.ReactNode;

/** A tab a build adds to the tab bar. */
export type CustomTab = {
    /** The custom route the tab opens on. */
    initialRoute: string;
    /** Draws the tab icon. The app's icons are 24×24, 2px stroke, no fill. */
    icon: TabIconRenderer;
    /** A translation key (e.g. from brand/translations), or the label itself. */
    labelKey?: string;
    label?: string;
    /**
     * Where the tab goes when branding's `navigation.tabs` doesn't name it: an
     * index into the tabs (0 = first). Defaults to just before Account.
     */
    position?: number;
    /** Open the app on this tab. */
    initial?: boolean;
};

export type CustomRoutes = Record<string, CustomRoute>;
export type CustomTabs = Record<string, CustomTab>;

const ROUTE_NAME = /^[A-Z][A-Za-z0-9]{0,47}$/;

const warnOrThrow = (message: string, strict: boolean) => {
    if (strict) throw new Error(message);
    console.warn(message);
};

/**
 * Checks a build's routes and tabs; invalid entries throw in development and are
 * dropped otherwise. `coreRoutes` are the app's own route names: a custom route
 * may not take one (replace a core screen with a screen override instead).
 */
export function validateCustomNavigation(
    routes: CustomRoutes = {},
    tabs: CustomTabs = {},
    { coreRoutes = [], strict = typeof __DEV__ !== 'undefined' ? __DEV__ : false }: { coreRoutes?: string[]; strict?: boolean } = {}
): { routes: CustomRoutes; tabs: CustomTabs } {
    const taken = new Set<string>([...coreRoutes, ...CORE_TABS]);
    const validRoutes: CustomRoutes = {};
    for (const [name, route] of Object.entries(routes ?? {})) {
        if (!ROUTE_NAME.test(name) || typeof route?.load !== 'function') {
            warnOrThrow(`[extensions] Invalid custom route "${name}": expected a PascalCase name and { load: () => import(...) }.`, strict);
            continue;
        }
        if (taken.has(name)) {
            warnOrThrow(`[extensions] Custom route "${name}" has the same name as a core route. Use a screen override to replace a core screen.`, strict);
            continue;
        }
        if (route.presentation !== undefined && route.presentation !== 'card' && route.presentation !== 'modal') {
            warnOrThrow(`[extensions] Custom route "${name}" has an invalid presentation "${String(route.presentation)}".`, strict);
            continue;
        }
        validRoutes[name] = route;
    }
    const validTabs: CustomTabs = {};
    for (const [name, tab] of Object.entries(tabs ?? {})) {
        if (!CUSTOM_TAB_NAME.test(name)) {
            warnOrThrow(`[extensions] Invalid custom tab "${name}": tab names are PascalCase and end in "Tab".`, strict);
            continue;
        }
        if (!tab || !validRoutes[tab.initialRoute]) {
            warnOrThrow(`[extensions] Custom tab "${name}" opens "${tab?.initialRoute}", which isn't a custom route.`, strict);
            continue;
        }
        if (typeof tab.icon !== 'function') {
            warnOrThrow(`[extensions] Custom tab "${name}" has no icon renderer.`, strict);
            continue;
        }
        validTabs[name] = tab;
    }
    return { routes: validRoutes, tabs: validTabs };
}

const routeComponents = new Map<string, React.ComponentType<any>>();
const routeLoadables = new Map<string, LoadableComponent>();

/** One loader per custom route, shared by its component and the boot preload. */
function routeLoadable(name: string, route: CustomRoute): LoadableComponent {
    let loadable = routeLoadables.get(name);
    if (!loadable) {
        loadable = createLoadable(route.load as any, `route:${name}`);
        routeLoadables.set(name, loadable);
    }
    return loadable;
}

/** A stable component per custom route that loads the screen and contains its failures. */
export function routeComponent(name: string, route: CustomRoute): React.ComponentType<any> {
    const existing = routeComponents.get(name);
    if (existing) return existing;
    const Loadable = routeLoadable(name, route);
    const CustomRouteScreen = (props: any) => (
        <ScreenErrorBoundary
            resetKey={props.route?.params}
            onError={(error) => console.error(`[extensions] Custom route "${name}" failed.`, error)}
            fallback={() => <ScreenLoadError id={name} />}
        >
            <Suspense fallback={<ScreenLoading />}>
                <Loadable {...props} />
            </Suspense>
        </ScreenErrorBoundary>
    );
    CustomRouteScreen.displayName = `CustomRoute(${name})`;
    const component = route.titleKey ? withHeader(route.titleKey, CustomRouteScreen) : CustomRouteScreen;
    routeComponents.set(name, component);
    return component;
}

export type StackRoute = { name: string; component: React.ComponentType<any>; options?: { presentation?: 'modal' } };

/** The custom routes a stack registers, in declaration order. */
export function customRoutesFor(stack: string, routes: CustomRoutes): StackRoute[] {
    return Object.entries(routes)
        .filter(([, route]) => !route.tabs || route.tabs.includes(stack))
        .map(([name, route]) => ({
            name,
            component: routeComponent(name, route),
            options: route.presentation === 'modal' ? { presentation: 'modal' } : undefined,
        }));
}

/** Preloads every custom route, so the first visit does not show a loading frame. */
export function preloadCustomRoutes(routes: CustomRoutes): Promise<void> {
    return Promise.all(
        Object.entries(routes).map(([name, route]) => routeLoadable(name, route).preload().catch(() => undefined))
    ).then(() => undefined);
}

/**
 * Orders tabs: names listed in `configured` keep that order (custom tabs can be
 * listed too); custom tabs that aren't listed go at their `position`, or just
 * before Account. Account is always present — sign-out and settings live there.
 */
export function orderTabs(configured: string[], custom: Array<[string, CustomTab]>, available: Set<string>): string[] {
    const order = configured.filter((name, index) => available.has(name) && configured.indexOf(name) === index);
    if (!order.includes('Account')) order.push('Account');
    for (const [name, tab] of custom) {
        if (order.includes(name)) continue;
        const accountIndex = order.indexOf('Account');
        const index = typeof tab.position === 'number' ? Math.max(0, Math.min(order.length, Math.floor(tab.position))) : accountIndex;
        order.splice(index, 0, name);
    }
    return order;
}
