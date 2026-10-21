/**
 * The extension API a client build programs against (docs/extensibility.md).
 * Screen ids, component ids, their params and props are a public contract.
 */
export { defineNavigatorExtensions, EXTENSIONS_SCHEMA_VERSION } from './define';
export type { NavigatorExtensions, AccountMenuLink } from './define';

export { SCREEN_IDS, isScreenId } from './screens/screen-ids';
export type { ScreenId } from './screens/screen-ids';
export type { ScreenParamMap } from './screens/params';
export type {
    NavigatorScreen,
    NavigatorScreenProps,
    NavigatorScreenBaseProps,
    ScreenEntry,
    ScreenLoader,
    ScreenOverrides,
    ScreenVariantSelection,
    ScreenErrorReporter,
} from './screens/types';
export { createScreenRegistry } from './screens/registry';
export type { ScreenRegistry, ScreenRegistryOptions } from './screens/registry';
export { ScreenRegistryProvider, useScreenRegistry } from './screens/ScreenRegistryContext';
export { screenSlot } from './screens/screen-slot';

export { COMPONENT_IDS, isComponentId } from './components/component-ids';
export type { ComponentId } from './components/component-ids';
export type { ComponentPropsMap, NavigatorComponent, NavigatorComponentProps, ComponentEntry, ComponentOverrides } from './components/types';

export { CORE_TABS } from './tabs';
export type { CoreTab } from './tabs';
export type { CustomRoute, CustomRoutes, CustomTab, CustomTabs, TabIconRenderer } from './navigation';
