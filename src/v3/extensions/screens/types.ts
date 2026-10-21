import type React from 'react';
import type { ScreenId } from './screen-ids';
import type { ScreenParamMap } from './params';

export type ScreenPlatform = 'ios' | 'android';

export type NavigatorScreenBaseProps<Id extends ScreenId> = {
    route: { key: string; name: string; params?: ScreenParamMap[Id] };
    navigation: any;
};

export type NavigatorScreenProps<Id extends ScreenId> = NavigatorScreenBaseProps<Id> & {
    /** The default implementation of this screen, so an override can wrap or compose it. */
    DefaultScreen: React.ComponentType<NavigatorScreenBaseProps<Id>>;
};

export type NavigatorScreen<Id extends ScreenId> = React.ComponentType<NavigatorScreenProps<Id>>;

export type ScreenModule<Id extends ScreenId> = { default: NavigatorScreen<Id> | React.ComponentType<any> };

export type ScreenLoader<Id extends ScreenId> = () => Promise<ScreenModule<Id>>;

export type ScreenEntry<Id extends ScreenId> = {
    /** Loads the implementation. Use `() => import('./MyScreen')`; platform files resolve as usual. */
    load: ScreenLoader<Id>;
    /** Compiled-in alternatives that declarative configuration may select by key. */
    variants?: Record<string, ScreenLoader<Id>>;
    /** Restrict the entry to some platforms; other platforms fall back to the default. */
    platforms?: ScreenPlatform[];
};

export type ScreenRegistryDefinition = { [Id in ScreenId]: ScreenEntry<Id> };

export type ScreenOverrides = Partial<{ [Id in ScreenId]: ScreenEntry<Id> }>;

/** Declarative selection of compiled-in variants, e.g. from branding. */
export type ScreenVariantSelection = Partial<Record<ScreenId, string>>;

export type ScreenSource = 'default' | 'override' | 'variant';

export type LoadableComponent = React.ComponentType<any> & { preload: () => Promise<React.ComponentType<any>> };

export type ResolvedScreen = {
    Component: LoadableComponent;
    Default: LoadableComponent;
    source: ScreenSource;
};

export type ScreenErrorReporter = (error: unknown, context: { id: string; source: ScreenSource }) => void;
