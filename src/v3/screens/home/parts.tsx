/**
 * The dashboard's building blocks — design round 3.
 *
 * Kept beside the dashboard rather than in `ui/` because nothing else draws
 * them yet; a second screen that wants a section label or a stat tile can lift
 * it from here.
 */
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Caption, Secondary } from '../../ui/Text';
import { space } from '../../theme/tokens';
import { CARD_RADIUS } from '../../onboarding/AuthScaffold';
import type { DutyState } from '../../shell';
import type { HomeWaypoint } from './homeModel';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/* -- Motion ---------------------------------------------------------------- */

/**
 * A section arriving: a short rise and fade, staggered by `delay`. With reduced
 * motion on, the section is simply there.
 */
export function Rise({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
    const progress = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        let cancelled = false;
        AccessibilityInfo.isReduceMotionEnabled()
            .catch(() => false)
            .then((reduced) => {
                if (cancelled) return;
                if (reduced) progress.setValue(1);
                else Animated.timing(progress, { toValue: 1, duration: 320, delay, useNativeDriver: true }).start();
            });
        return () => {
            cancelled = true;
        };
    }, [progress, delay]);
    return (
        <Animated.View style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
            {children}
        </Animated.View>
    );
}

/* -- Icons ----------------------------------------------------------------- */

export type HomeIconName = 'navigate' | 'power' | 'chat' | 'check' | 'bolt' | 'upload' | 'vehicle' | 'chevron' | 'fuel';

const ICON_PATHS: Record<Exclude<HomeIconName, 'navigate'>, string[]> = {
    power: ['M12 3v9', 'M6.3 7.5a8 8 0 1 0 11.4 0'],
    chat: ['M4 6h16v10H9l-5 4V6z'],
    check: ['M9 4h6l1 3h3v13H5V7h3l1-3z', 'M9 13l2 2 4-4'],
    bolt: ['M13 3L5 14h6l-1 7 8-11h-6z'],
    upload: ['M12 16V5', 'M7 10l5-5 5 5', 'M5 19h14'],
    vehicle: ['M3 7h11v9H3z', 'M14 10h4l3 3v3h-7z', 'M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
    chevron: ['M9 5l7 7-7 7'],
    fuel: ['M5 20V5h9v15', 'M4 20h11', 'M7 9h5', 'M14 11h3v6a1.5 1.5 0 0 0 3 0V9l-3-3'],
};

export function HomeIcon({ name, color, size = 20 }: { name: HomeIconName; color: string; size?: number }) {
    if (name === 'navigate') {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <Path d="M12 2l8 19-8-4-8 4z" />
            </Svg>
        );
    }
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
            {ICON_PATHS[name].map((d) => (
                <Path key={d} d={d} />
            ))}
        </Svg>
    );
}

/* -- Labels and tiles ------------------------------------------------------- */

/** 12/800, tracked, upper case: the label above a group of cards. */
export function SectionLabel({ children, tone = 'muted', testID }: { children: string; tone?: 'muted' | 'brand' | 'success'; testID?: string }) {
    return (
        <Caption fontSize={12} lineHeight={16} fontWeight="800" letterSpacing={0.7} tone={tone} numberOfLines={1} testID={testID}>
            {children.toUpperCase()}
        </Caption>
    );
}

/** A card in the round 3 shape: radius 18, 1px border, 14 inside. */
export function Card({ children, onPress, tone, testID, label, padded = true }: { children: React.ReactNode; onPress?: () => void; tone?: 'warning'; testID?: string; label?: string; padded?: boolean }) {
    return (
        <YStack
            borderRadius={CARD_RADIUS}
            borderWidth={1}
            borderColor={tone === 'warning' ? '$warningBorder' : '$border'}
            backgroundColor={tone === 'warning' ? '$warningFill' : '$surface'}
            padding={padded ? 14 : 0}
            overflow="hidden"
            onPress={onPress}
            pressStyle={onPress ? { opacity: 0.7 } : undefined}
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={label}
            testID={testID}
        >
            {children}
        </YStack>
    );
}

export interface Stat {
    key: string;
    value: string;
    label: string;
    tone?: 'primary' | 'success' | 'warning' | 'danger';
}

/** A big tabular figure over a small label. Never more than three or four in a row. */
export function StatTile({ stat, size = 24 }: { stat: Stat; size?: number }) {
    return (
        <YStack flex={1} flexBasis={0} gap={2} minWidth={0} testID={`home-stat-${stat.key}`}>
            <Body fontSize={size} lineHeight={size + 6} fontWeight="800" tabular tone={stat.tone ?? 'primary'} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {stat.value}
            </Body>
            <Secondary fontSize={12} lineHeight={16} numberOfLines={2}>
                {stat.label}
            </Secondary>
        </YStack>
    );
}

export function StatRow({ stats, size, testID }: { stats: Stat[]; size?: number; testID?: string }) {
    if (!stats.length) return null;
    return (
        <XStack gap={space[2]} testID={testID}>
            {stats.map((stat) => (
                <StatTile key={stat.key} stat={stat} size={size} />
            ))}
        </XStack>
    );
}

/* -- Header controls -------------------------------------------------------- */

/**
 * The duty control. Shape carries the state as well as colour: a filled disc
 * for on duty, a square for off, a ring for a break.
 */
export function DutyChip({ duty, onPress, t, floating }: { duty: DutyState; onPress?: () => void; t: Translate; floating?: boolean }) {
    const label = t(`home.duty.${duty}`);
    const mark =
        duty === 'on' ? (
            <YStack width={10} height={10} borderRadius={5} backgroundColor="$successText" />
        ) : duty === 'break' ? (
            <YStack width={10} height={10} borderRadius={5} borderWidth={2.5} borderColor="$warningText" />
        ) : (
            <YStack width={10} height={10} borderRadius={2} backgroundColor="$textMuted" />
        );
    return (
        <XStack
            height={44}
            alignItems="center"
            gap={space[2]}
            paddingHorizontal={14}
            borderRadius={22}
            backgroundColor={floating ? '$background' : '$surface'}
            borderWidth={1}
            borderColor={duty === 'on' ? '$successBorder' : duty === 'break' ? '$warningBorder' : '$border'}
            onPress={onPress}
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityLabel={t('home.duty.change', { status: label })}
            testID="home-duty"
        >
            {mark}
            <Body fontSize={14} lineHeight={18} fontWeight="700" tone={duty === 'on' ? 'success' : duty === 'break' ? 'warning' : 'secondary'} numberOfLines={1}>
                {label}
            </Body>
        </XStack>
    );
}

/** Whose work this is: the organisation's initial and its name, floating over the map. */
export function OrgChip({ name }: { name: string }) {
    if (!name) return <YStack />;
    return (
        <XStack flexShrink={1} height={44} alignItems="center" gap={10} paddingLeft={6} paddingRight={14} borderRadius={22} backgroundColor="$background" borderWidth={1} borderColor="$border" testID="home-organization">
            <YStack width={32} height={32} borderRadius={16} backgroundColor="$primary" alignItems="center" justifyContent="center">
                <Body fontSize={14} lineHeight={18} fontWeight="800" tone="onPrimary">
                    {name.trim().charAt(0).toUpperCase()}
                </Body>
            </YStack>
            <Body flexShrink={1} fontSize={15} lineHeight={20} fontWeight="700" numberOfLines={1}>
                {name}
            </Body>
        </XStack>
    );
}

/* -- Entry cards ------------------------------------------------------------ */

/**
 * A row that leads somewhere: an icon tile, a title, one line under it, and
 * either a count or a chevron. The warning tone is for things the driver has
 * to do before carrying on.
 */
export function EntryCard({
    icon,
    title,
    body,
    mono,
    count,
    tone,
    onPress,
    testID,
}: {
    icon: HomeIconName;
    title: string;
    body?: string;
    /** An identifier shown under the body, monospaced and in full. */
    mono?: string;
    count?: number;
    tone?: 'warning';
    onPress?: () => void;
    testID?: string;
}) {
    const theme = useTheme();
    const accent = (tone === 'warning' ? theme.warningText?.val : theme.textSecondary?.val) as string;
    return (
        <Card onPress={onPress} tone={tone} testID={testID} label={[title, body].filter(Boolean).join('. ')}>
            <XStack alignItems="center" gap={space[3]}>
                <YStack width={40} height={40} borderRadius={12} backgroundColor={tone === 'warning' ? '$warningFill' : '$surfaceRaised'} alignItems="center" justifyContent="center">
                    <HomeIcon name={icon} color={accent} />
                </YStack>
                <YStack flex={1} gap={2} minWidth={0}>
                    <Body fontSize={16} lineHeight={21} fontWeight="700" numberOfLines={2}>
                        {title}
                    </Body>
                    {body ? (
                        <Secondary fontSize={13} lineHeight={18} numberOfLines={2}>
                            {body}
                        </Secondary>
                    ) : null}
                    {mono ? (
                        <Secondary fontFamily="$mono" fontSize={13} lineHeight={18}>
                            {mono}
                        </Secondary>
                    ) : null}
                </YStack>
                {count ? (
                    <YStack minWidth={24} height={24} paddingHorizontal={6} borderRadius={12} backgroundColor="$primary" alignItems="center" justifyContent="center">
                        <Body fontSize={12} lineHeight={16} fontWeight="800" tone="onPrimary" tabular>
                            {count > 99 ? '99+' : String(count)}
                        </Body>
                    </YStack>
                ) : onPress ? (
                    <HomeIcon name="chevron" color={accent} size={18} />
                ) : null}
            </XStack>
        </Card>
    );
}

/* -- Progress --------------------------------------------------------------- */

/** Past this many waypoints the segments are too thin to read, so the bar becomes one fill. */
const MAX_SEGMENTS = 24;

/**
 * Day progress: one segment per waypoint. Decorative — the sentence above it
 * says the same thing in words, so the bar is hidden from screen readers.
 */
export function SegmentBar({ total, done, hasCurrent }: { total: number; done: number; hasCurrent?: boolean }) {
    if (total <= 0) return null;

    if (total > MAX_SEGMENTS) {
        return (
            <YStack height={6} borderRadius={3} backgroundColor="$border" overflow="hidden" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <YStack height={6} borderRadius={3} backgroundColor="$successText" width={`${Math.round((done / total) * 100)}%`} />
            </YStack>
        );
    }
    return (
        <XStack gap={4} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="home-progress-bar">
            {Array.from({ length: total }, (_, index) => (
                <YStack
                    key={index}
                    flex={1}
                    height={6}
                    borderRadius={3}
                    backgroundColor={index < done ? '$successText' : index === done && hasCurrent ? '$primary' : '$border'}
                />
            ))}
        </XStack>
    );
}

/* -- Waypoint rows ---------------------------------------------------------- */

/** One of the next few waypoints: its number, where it is, the order it belongs to, and a time if there is one. */
export function WaypointRow({ waypoint, time, first, onPress }: { waypoint: HomeWaypoint; time?: string; first?: boolean; onPress?: () => void }) {
    return (
        <XStack
            alignItems="center"
            gap={space[3]}
            minHeight={60}
            paddingVertical={space[2]}
            paddingHorizontal={14}
            borderTopWidth={first ? 0 : 1}
            borderTopColor="$border"
            onPress={onPress}
            pressStyle={onPress ? { opacity: 0.7 } : undefined}
            accessibilityRole={onPress ? 'button' : undefined}
            testID={`home-upcoming-${waypoint.key}`}
        >
            <YStack width={32} height={32} borderRadius={10} borderWidth={1.5} borderColor="$border" backgroundColor="$surfaceRaised" alignItems="center" justifyContent="center">
                <Body fontSize={14} lineHeight={18} fontWeight="800" tabular>
                    {waypoint.number}
                </Body>
            </YStack>
            <YStack flex={1} gap={1} minWidth={0}>
                <Body fontSize={15} lineHeight={20} fontWeight="700" numberOfLines={1}>
                    {waypoint.name ?? waypoint.address ?? '—'}
                </Body>
                {waypoint.name && waypoint.address ? (
                    <Secondary fontSize={13} lineHeight={18} numberOfLines={1}>
                        {waypoint.address}
                    </Secondary>
                ) : null}
                {waypoint.trackingNumber ? (
                    <Secondary fontFamily="$mono" fontSize={12} lineHeight={16}>
                        {waypoint.trackingNumber}
                    </Secondary>
                ) : null}
            </YStack>
            {time ? (
                <Body fontSize={15} lineHeight={20} fontWeight="700" tabular numberOfLines={1}>
                    {time}
                </Body>
            ) : null}
        </XStack>
    );
}

/** A row of the end-of-day list: a shaped mark, what it is about, and a figure. */
export function SummaryRow({ kind, title, body, value, first, testID }: { kind: 'ok' | 'attention'; title: string; body?: string; value?: string; first?: boolean; testID?: string }) {
    const theme = useTheme();
    const ok = kind === 'ok';
    const stroke = (ok ? theme.successText?.val : theme.warningText?.val) as string;
    return (
        <XStack alignItems="center" gap={space[3]} minHeight={60} paddingVertical={space[2]} paddingHorizontal={14} borderTopWidth={first ? 0 : 1} borderTopColor="$border" testID={testID}>
            {/* A disc with a tick, or a rounded square with a bang: the shape differs as well as the colour. */}
            <YStack width={28} height={28} borderRadius={ok ? 14 : 8} borderWidth={1} borderColor={ok ? '$successBorder' : '$warningBorder'} backgroundColor={ok ? '$successFill' : '$warningFill'} alignItems="center" justifyContent="center">
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    {ok ? <Path d="M5 12l5 5 9-10" /> : <Path d="M12 5v8" />}
                    {ok ? null : <Circle cx={12} cy={18.5} r={0.6} />}
                </Svg>
            </YStack>
            <YStack flex={1} gap={1} minWidth={0}>
                <Body fontSize={15} lineHeight={20} fontWeight="800" numberOfLines={2}>
                    {title}
                </Body>
                {body ? (
                    <Secondary fontSize={13} lineHeight={18} numberOfLines={2}>
                        {body}
                    </Secondary>
                ) : null}
            </YStack>
            {value ? (
                <Body fontSize={16} lineHeight={21} fontWeight="800" tabular numberOfLines={1}>
                    {value}
                </Body>
            ) : null}
        </XStack>
    );
}
