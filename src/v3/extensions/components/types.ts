import type React from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { ComponentId } from './component-ids';
import type { SignInScreenProps } from '../../screens/SignInScreen';
import type { AppHeaderProps } from '../../shell/AppHeader';
import type { TabBadges } from '../../navigation/TabBar';
import type { OrderCardProps } from '../../ui/Cards';
import type { StopRowProps } from '../../ui/Rows';
import type { ScreenPlatform } from '../screens/types';

/**
 * Props per component id. Part of the public contract: an override receives
 * exactly these, so changing one is a breaking change for client builds and
 * belongs in the release notes.
 */
export type ComponentPropsMap = {
    'auth.signIn': SignInScreenProps;
    'shell.appHeader': AppHeaderProps;
    'shell.tabBar': BottomTabBarProps & { badges?: TabBadges };
    'orders.orderCard': OrderCardProps;
    'route.stopRow': StopRowProps;
};

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Fails to compile when a component id has no props entry, or an entry has no id. */
export const PROPS_MAP_COVERS_ALL_COMPONENTS: Exact<keyof ComponentPropsMap, ComponentId> = true;

export type NavigatorComponentProps<Id extends ComponentId> = ComponentPropsMap[Id] & {
    /** The app's own implementation, so an override can wrap or compose it. */
    Default: React.ComponentType<ComponentPropsMap[Id]>;
};

export type NavigatorComponent<Id extends ComponentId> = React.ComponentType<NavigatorComponentProps<Id>>;

export type ComponentEntry<Id extends ComponentId> = {
    /** Loads the implementation: `() => import('./components/MyOrderCard')`. */
    load: () => Promise<{ default: NavigatorComponent<Id> | React.ComponentType<any> }>;
    /** Restrict the entry to some platforms; other platforms keep the default. */
    platforms?: ScreenPlatform[];
};

export type ComponentOverrides = Partial<{ [Id in ComponentId]: ComponentEntry<Id> }>;
