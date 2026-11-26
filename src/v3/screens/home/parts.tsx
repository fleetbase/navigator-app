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
import { formatClock } from '../../format';
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

export type HomeIconName = 'navigate' | 'power' | 'chat' | 'check' | 'bolt' | 'upload' | 'vehicle' | 'chevron' | 'fuel' | 'tick';

const ICON_PATHS: Record<Exclude<HomeIconName, 'navigate'>, string[]> = {
    power: ['M12 3v9', 'M6.3 7.5a8 8 0 1 0 11.4 0'],
    chat: ['M4 6h16v10H9l-5 4V6z'],
    check: ['M9 4h6l1 3h3v13H5V7h3l1-3z', 'M9 13l2 2 4-4'],
    bolt: ['M13 3L5 14h6l-1 7 8-11h-6z'],
    upload: ['M12 16V5', 'M7 10l5-5 5 5', 'M5 19h14'],
    // The mockup's van: a cab and body outline over two wheels.
    vehicle: ['M3 16V8l4-3h7l5 5v6', 'M5.5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M14.5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0'],
    chevron: ['M9 5l7 7-7 7'],
    tick: ['M5 12l5 5 9-10'],
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

/** 12/800, tracked, upper case: the label above a group of cards. The hero's eyebrow is the same at 700. */
export function SectionLabel({ children, tone = 'muted', weight = '800', testID }: { children: string; tone?: 'muted' | 'brand' | 'success'; weight?: '700' | '800'; testID?: string }) {
    return (
        <Caption fontSize={12} lineHeight={16} fontWeight={weight} letterSpacing={0.7} tone={tone} numberOfLines={1} testID={testID}>
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
export function StatTile({ stat, size = 26 }: { stat: Stat; size?: number }) {
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

/* -- Over the map ----------------------------------------------------------- */

/**
 * What a chip floating on the map is painted with. In the dark schemes it is
 * the page colour at 88%, so the map shows faintly through; in the light ones
 * it is a solid surface with a soft shadow, because a translucent white chip
 * over a pale map has no edge.
 */
function useChipSkin(dark?: boolean) {
    const theme = useTheme();
    const page = theme.background?.val as string;
    return dark
        ? // 88% of the page colour; a brand override that is not a six-digit hex is used as it is.
          { backgroundColor: /^#[0-9a-f]{6}$/i.test(page) ? `${page}E0` : page }
        : {
              backgroundColor: theme.surface?.val as string,
              shadowColor: theme.shadowColor?.val as string,
              shadowOpacity: 0.08,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
          };
}

/**
 * The driver's status, and the way to change it. Shape carries the state as
 * well as colour: a filled disc for online, a square for offline, a ring for a
 * break. Once the server has said when the driver went online, that time sits
 * in a small tag under the chip.
 */
export function DutyChip({ duty, onPress, t, dark, since }: { duty: DutyState; onPress?: () => void; t: Translate; dark?: boolean; since?: string | null }) {
    const skin = useChipSkin(dark);
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
        <YStack alignItems="flex-end" gap={space[1]} flexShrink={0}>
            <XStack
                height={44}
                alignItems="center"
                gap={space[2]}
                paddingHorizontal={14}
                borderRadius={22}
                borderWidth={1}
                borderColor={duty === 'on' ? '$successBorder' : duty === 'break' ? '$warningBorder' : '$border'}
                onPress={onPress}
                pressStyle={{ opacity: 0.7 }}
                accessibilityRole="button"
                accessibilityLabel={t('home.duty.change', { status: label })}
                testID="home-duty"
                {...skin}
            >
                {/* On a light map the chip is tinted with its state, as the light mockup draws it. */}
                {!dark && duty !== 'off' ? (
                    <YStack position="absolute" top={0} right={0} bottom={0} left={0} borderRadius={22} backgroundColor={duty === 'on' ? '$successFill' : '$warningFill'} pointerEvents="none" />
                ) : null}
                {mark}
                <Body fontSize={14} lineHeight={18} fontWeight="700" tone={duty === 'on' ? 'success' : duty === 'break' ? 'warning' : 'secondary'} numberOfLines={1}>
                    {label}
                </Body>
            </XStack>
            {since ? (
                <XStack height={22} alignItems="center" paddingHorizontal={10} borderRadius={11} borderWidth={1} borderColor="$border" {...skin}>
                    <Secondary fontSize={12} lineHeight={16} tabular numberOfLines={1} testID="home-duty-since">
                        {t('home.duty.since', { time: formatClock(since) })}
                    </Secondary>
                </XStack>
            ) : null}
        </YStack>
    );
}

/** Whose work this is: the organisation's initial and its name, floating over the map. */
export function OrgChip({ name, dark }: { name: string; dark?: boolean }) {
    const skin = useChipSkin(dark);
    if (!name) return <YStack />;
    return (
        <XStack flexShrink={1} height={44} alignItems="center" gap={10} paddingLeft={6} paddingRight={14} borderRadius={22} borderWidth={1} borderColor="$border" testID="home-organization" {...skin}>
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

/* -- The sheet's hero -------------------------------------------------------- */

/**
 * The 48px tile that leads the hero. A waypoint's number on the brand colour
 * when the hero is a waypoint; otherwise a glyph on a quiet tile, so a hero
 * that is not a place does not pretend to be one.
 */
export function HeroBadge({ number, icon, tone = 'brand' }: { number?: number; icon?: HomeIconName; tone?: 'brand' | 'success' | 'neutral' }) {
    const theme = useTheme();
    const brand = tone === 'brand';
    const glyph = (brand ? theme.onPrimary?.val : tone === 'success' ? theme.successText?.val : theme.textSecondary?.val) as string;
    return (
        <YStack
            width={48}
            height={48}
            borderRadius={14}
            flexShrink={0}
            alignItems="center"
            justifyContent="center"
            backgroundColor={brand ? '$primary' : tone === 'success' ? '$successFill' : '$surface'}
            borderWidth={brand ? 0 : 1}
            borderColor={tone === 'success' ? '$successBorder' : '$border'}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            {number != null ? (
                <Body fontSize={22} lineHeight={28} fontWeight="800" tone={brand ? 'onPrimary' : 'primary'} tabular>
                    {number}
                </Body>
            ) : icon ? (
                <HomeIcon name={icon} color={glyph} size={24} />
            ) : null}
        </YStack>
    );
}

/** The stat card: figures three to a row, as many rows as there are figures. */
export function StatCard({ stats, testID }: { stats: Stat[]; testID?: string }) {
    if (!stats.length) return null;
    const rows: Stat[][] = [];
    for (let index = 0; index < stats.length; index += 3) rows.push(stats.slice(index, index + 3));
    return (
        <Card testID={testID}>
            <YStack gap={14}>
                {rows.map((row) => (
                    <XStack key={row[0].key} gap={space[2]}>
                        {row.map((stat) => (
                            <StatTile key={stat.key} stat={stat} />
                        ))}
                        {/* A short last row keeps the column width of the rows above it. */}
                        {rows.length > 1 ? Array.from({ length: 3 - row.length }, (_, index) => <YStack key={`pad-${index}`} flex={1} flexBasis={0} />) : null}
                    </XStack>
                ))}
            </YStack>
        </Card>
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
    accent: accentTone,
    onPress,
    testID,
}: {
    icon: HomeIconName;
    title: string;
    body?: string;
    /** An identifier (a plate) at the row's right edge, monospaced and in full. */
    mono?: string;
    count?: number;
    tone?: 'warning';
    /** Colours the glyph alone, on a plain card: the offers row's amber bolt. */
    accent?: 'warning';
    onPress?: () => void;
    testID?: string;
}) {
    const theme = useTheme();
    const accent = (tone === 'warning' || accentTone === 'warning' ? theme.warningText?.val : theme.textSecondary?.val) as string;
    const chevron = (tone === 'warning' ? theme.warningText?.val : theme.textSecondary?.val) as string;
    return (
        <Card onPress={onPress} tone={tone} testID={testID} label={[title, body].filter(Boolean).join('. ')}>
            <XStack alignItems="center" gap={space[3]}>
                <YStack width={36} height={36} borderRadius={10} flexShrink={0} backgroundColor={tone === 'warning' ? '$warningFill' : '$surfaceRaised'} alignItems="center" justifyContent="center">
                    <HomeIcon name={icon} color={accent} size={18} />
                </YStack>
                <YStack flex={1} gap={1} minWidth={0}>
                    <Body fontSize={15} lineHeight={20} fontWeight="700" numberOfLines={2}>
                        {title}
                    </Body>
                    {body ? (
                        <Secondary fontSize={13} lineHeight={18} numberOfLines={2}>
                            {body}
                        </Secondary>
                    ) : null}
                </YStack>
                {mono ? (
                    <Secondary fontFamily="$mono" fontSize={13} lineHeight={18} flexShrink={0}>
                        {mono}
                    </Secondary>
                ) : null}
                {count ? (
                    <YStack minWidth={24} height={24} paddingHorizontal={6} borderRadius={12} backgroundColor="$primary" alignItems="center" justifyContent="center">
                        <Body fontSize={12} lineHeight={16} fontWeight="800" tone="onPrimary" tabular>
                            {count > 99 ? '99+' : String(count)}
                        </Body>
                    </YStack>
                ) : onPress ? (
                    <HomeIcon name="chevron" color={chevron} size={18} />
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
