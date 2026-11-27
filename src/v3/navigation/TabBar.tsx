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
import { Platform, StyleSheet } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Micro } from '../ui/Text';
import { tabIcons, type TabIconName } from '../ui/Icon';
import { space } from '../theme/tokens';
import { componentSlot } from '../extensions/components/component-slot';
import { useResolvedScheme } from '../settings';

export interface TabBadges {
    /** Active stops/orders outstanding. */
    Orders?: number;
    /** Unread conversations + unread notifications. */
    Inbox?: number;
    Route?: number;
}

/** Height of the floating bar itself. */
export const TAB_BAR_HEIGHT = 64;
/** Gap between the bar and the bottom of the screen, above the home indicator. */
const TAB_BAR_GAP = 12;

/**
 * How much room a root tab screen must leave at the bottom so its last row can
 * scroll clear of the floating bar. Zero on a pushed screen, where the bar is
 * hidden.
 */
export function useTabBarSpace(): number {
    const insets = useSafeAreaInsets();
    return TAB_BAR_HEIGHT + TAB_BAR_GAP + Math.max(insets.bottom, space[2]) + space[3];
}

/**
 * The floating tab bar — design round 3. A pill of glass that sits over the
 * content rather than a strip under it: what is behind shows through, blurred. the active tab is a filled capsule with its
 * icon and label, the others are icons alone. It is hidden once a screen is
 * pushed inside a tab, because those screens anchor their own action at the
 * bottom.
 */
function TabBarBase({ state, descriptors, navigation, badges = {} }: BottomTabBarProps & { badges?: TabBadges }) {
    const { t } = useTranslation();
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const scheme = useResolvedScheme();
    const dark = scheme !== 'light' && scheme !== 'sunlight';
    /*
     * Glass: a blur of whatever is behind, under a thin tint that keeps the
     * icons legible over a bright map or a white card. Android has no cheap
     * live blur, so there the tint is heavier and stands in for it.
     */
    const blurs = Platform.OS !== 'android';
    const tint = dark ? (blurs ? 'rgba(18, 24, 34, 0.42)' : 'rgba(18, 24, 34, 0.90)') : blurs ? 'rgba(255, 255, 255, 0.46)' : 'rgba(255, 255, 255, 0.92)';
    const edge = dark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(10, 15, 23, 0.10)';

    // Depth inside the focused tab's own stack: anything past its first screen hides the bar.
    const focusedRoute = state.routes[state.index];
    const depth = (focusedRoute?.state as { index?: number } | undefined)?.index ?? 0;
    if (depth > 0) return null;

    return (
        <YStack position="absolute" left={space[4]} right={space[4]} bottom={Math.max(insets.bottom, space[2]) + TAB_BAR_GAP - space[2]} pointerEvents="box-none">
            <YStack borderRadius={TAB_BAR_HEIGHT / 2} shadowColor="#000000" shadowOpacity={dark ? 0.4 : 0.16} shadowRadius={18} shadowOffset={{ width: 0, height: 10 }}>
            <XStack
                testID="tab-bar"
                height={TAB_BAR_HEIGHT}
                alignItems="center"
                justifyContent="space-between"
                paddingHorizontal={space[2]}
                borderRadius={TAB_BAR_HEIGHT / 2}
                overflow="hidden"
                backgroundColor={(blurs ? 'transparent' : tint) as never}
                borderWidth={1}
                borderColor={edge as never}
                accessibilityRole="tablist"
            >
                {blurs ? <BlurView style={StyleSheet.absoluteFill} blurType={dark ? 'dark' : 'light'} blurAmount={22} reducedTransparencyFallbackColor={dark ? '#121822' : '#FFFFFF'} /> : null}
                {/* The tint sits over the blur; the tabs over both. */}
                {blurs ? <YStack position="absolute" top={0} right={0} bottom={0} left={0} backgroundColor={tint as never} pointerEvents="none" /> : null}
                {state.routes.map((route, index) => {
                    const focused = state.index === index;
                    const { options } = descriptors[route.key];
                    // A translation key when there is one; a custom tab may give a plain `title` instead.
                    const label =
                        typeof options.tabBarLabel === 'string' ? t(options.tabBarLabel, { defaultValue: options.title ?? route.name }) : (options.title ?? route.name);
                    // A custom tab, or a branding icon override, draws through
                    // `tabBarIcon`; the core tabs fall back to the design's set.
                    const renderIcon = options.tabBarIcon;
                    const Icon = tabIcons[route.name as TabIconName];
                    const badge = badges[route.name as keyof TabBadges];

                    const color = (focused ? theme.onPrimary?.val ?? '#FFFFFF' : theme.textSecondary?.val) as string;

                    const onPress = () => {
                        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                        if (!focused && !event.defaultPrevented) {
                            navigation.navigate(route.name as never);
                        }
                    };

                    return (
                        <XStack
                            key={route.key}
                            height={48}
                            minWidth={64}
                            alignItems="center"
                            justifyContent="center"
                            gap={space[2]}
                            paddingHorizontal={focused ? 20 : 0}
                            borderRadius={24}
                            backgroundColor={focused ? '$primary' : '$transparent'}
                            onPress={onPress}
                            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                            pressStyle={{ opacity: 0.7 }}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: focused }}
                            accessibilityLabel={badge ? `${label}, ${badge} pending` : label}
                            testID={`tab-${route.name}`}
                        >
                            <YStack>
                                {renderIcon ? renderIcon({ focused, color, size: 24 }) : Icon ? <Icon size={24} color={color} strokeWidth={2.6} /> : null}
                                {badge && !focused ? (
                                    <XStack
                                        position="absolute"
                                        top={-6}
                                        end={-12}
                                        minWidth={18}
                                        height={18}
                                        paddingHorizontal={5}
                                        borderRadius={999}
                                        backgroundColor="$primary"
                                        borderWidth={2}
                                        borderColor="$background"
                                        alignItems="center"
                                        justifyContent="center"
                                    >
                                        <Micro fontSize={10} fontWeight="800" color="$white" tabular>
                                            {badge > 99 ? '99+' : badge}
                                        </Micro>
                                    </XStack>
                                ) : null}
                            </YStack>
                            {focused ? (
                                <Body fontSize={15} fontWeight="700" color={color as never} numberOfLines={1}>
                                    {label}
                                </Body>
                            ) : null}
                        </XStack>
                    );
                })}
            </XStack>
            </YStack>
        </YStack>
    );
}

/** A component slot: a client build may replace it (`shell.tabBar`). */
export const TabBar = componentSlot('shell.tabBar', TabBarBase);

export default TabBar;
