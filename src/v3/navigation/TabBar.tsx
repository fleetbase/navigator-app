/**
 * Custom tab bar.
 *
 * Exists specifically so badge counts can come from context *inside a real
 * component*. v2 called `useOrderManager()` and `useChat()` from inside the
 * navigator's `options` callbacks (DriverNavigator.tsx:91 and :114), which
 * re-run on every navigation state change and re-render the whole navigator
 * subtree. Here the subscription lives where hooks belong.
 *
 * Also fixes v2's `tabBarLabelStyle`, which was a function where React
 * Navigation expects a style object and referenced an undefined `focued`; it
 * silently never ran.
 */
import { useTranslation } from '../i18n/useTranslation';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack, useTheme } from 'tamagui';
import { Micro } from '../ui/Text';
import { tabIcons, type TabIconName } from '../ui/Icon';
import { hitTarget, space } from '../theme/tokens';

export interface TabBadges {
    /** Active stops/orders outstanding. */
    Orders?: number;
    /** Unread conversations + unread notifications. */
    Inbox?: number;
    Route?: number;
}

export function TabBar({ state, descriptors, navigation, badges = {} }: BottomTabBarProps & { badges?: TabBadges }) {
    const { t } = useTranslation();
    const theme = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <XStack
            testID="tab-bar"
            backgroundColor="$surface"
            borderTopWidth={1}
            borderTopColor="$border"
            paddingTop={space[2]}
            paddingBottom={Math.max(insets.bottom, space[3])}
            accessibilityRole="tablist"
        >
            {state.routes.map((route, index) => {
                const focused = state.index === index;
                const { options } = descriptors[route.key];
                const label = t((options.tabBarLabel as string) ?? options.title ?? route.name, { defaultValue: route.name });
                const Icon = tabIcons[route.name as TabIconName];
                const badge = badges[route.name as keyof TabBadges];

                const color = (focused ? theme.primary?.val : theme.textMuted?.val) as string;

                const onPress = () => {
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) {
                        navigation.navigate(route.name as never);
                    }
                };

                return (
                    <YStack
                        key={route.key}
                        flex={1}
                        minHeight={hitTarget.min}
                        alignItems="center"
                        justifyContent="center"
                        gap={space[1]}
                        onPress={onPress}
                        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                        pressStyle={{ opacity: 0.6 }}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: focused }}
                        accessibilityLabel={badge ? `${label}, ${badge} pending` : label}
                        testID={`tab-${route.name}`}
                    >
                        <YStack>
                            {Icon ? <Icon size={20} color={color} /> : null}
                            {badge ? (
                                <XStack
                                    position="absolute"
                                    top={-4}
                                    end={-10}
                                    minWidth={15}
                                    height={15}
                                    paddingHorizontal={4}
                                    borderRadius={999}
                                    backgroundColor="$danger"
                                    alignItems="center"
                                    justifyContent="center"
                                >
                                    <Micro fontSize={9} color="$white" tabular>
                                        {badge > 99 ? '99+' : badge}
                                    </Micro>
                                </XStack>
                            ) : null}
                        </YStack>
                        <Micro fontSize={10} color={color as never}>
                            {label}
                        </Micro>
                    </YStack>
                );
            })}
        </XStack>
    );
}

export default TabBar;
