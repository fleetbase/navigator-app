import React from 'react';
import { Platform } from 'react-native';
import { getBuildExtensions } from './build-extensions';
import { getBuildBranding } from '../branding/build-branding';
import { createScreenRegistry } from './screens/registry';
import { defaultScreens } from './screens/default-screens';
import { ScreenRegistryProvider } from './screens/ScreenRegistryContext';
import { renderScreenLoadError, renderScreenLoading } from './screens/ScreenFallbacks';
import { preloadComponentOverrides } from './components/component-slot';
import { preloadCustomRoutes } from './navigation';
import { customNavigation } from './build-navigation';
import type { ScreenId } from './screens/screen-ids';
import type { ScreenVariantSelection } from './screens/types';

const extensions = getBuildExtensions();

export const appScreenRegistry = createScreenRegistry(extensions.screens ?? {}, { defaults: defaultScreens, platform: Platform.OS });

// Variant selections from branding (declarative) apply first; the build's extensions file wins.
const brandingVariants = Object.fromEntries(Object.entries(getBuildBranding().branding.screens).map(([id, selection]) => [id, selection?.variant]));
export const appScreenVariants: ScreenVariantSelection = { ...brandingVariants, ...(extensions.screenVariants ?? {}) };

/** Screens a driver sees first; preloading them avoids a loading frame on the first frame after sign-in. */
export const INITIAL_SCREEN_IDS: ScreenId[] = ['today.home', 'orders.list', 'order.detail', 'route.home', 'inbox.list', 'account.home', 'navigation.handoff'];

/**
 * Loads what the first screens need before the splash goes: the initial screens,
 * every component override, and the custom routes. Never rejects.
 */
export const preloadInitialScreens = () =>
    Promise.all([appScreenRegistry.preload(INITIAL_SCREEN_IDS, appScreenVariants), preloadComponentOverrides(), preloadCustomRoutes(customNavigation.routes)]).then(
        () => undefined,
        () => undefined
    );

export const AppScreenRegistryProvider = ({ children }: { children: React.ReactNode }) => (
    <ScreenRegistryProvider
        registry={appScreenRegistry}
        variants={appScreenVariants}
        renderLoading={renderScreenLoading}
        renderLoadError={renderScreenLoadError}
        onError={extensions.onError}
    >
        {children}
    </ScreenRegistryProvider>
);
