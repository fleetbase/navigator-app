/**
 * The dashboard's building blocks — design round 3.
 *
 * Kept beside the dashboard rather than in `ui/` because nothing else draws
 * them yet; a second screen that wants a section label or a stat tile can lift
 * it from here.
 */
import { StopBadge } from '../../ui/RouteMap';
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

export type HomeIconName = 'navigate' | 'power' | 'chat' | 'check' | 'bolt' | 'upload' | 'vehicle' | 'chevron' | 'fuel' | 'tick' | 'issue' | 'box' | 'cash' | 'pen' | 'note' | 'calendar' | 'camera' | 'scan' | 'clock' | 'phone';

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
    issue: ['M12 4l9 16H3z', 'M12 10v5', 'M12 17.5v.5'],
    box: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M4 7.5l8 4.5 8-4.5', 'M12 12v9'],
    cash: ['M3 7h18v10H3z', 'M12 14.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5z', 'M6 10v4', 'M18 10v4'],
    pen: ['M4 20l4-1L19 8l-3-3L5 16z', 'M14 7l3 3'],
    note: ['M6 3h9l4 4v14H6z', 'M9 11h7', 'M9 15h5'],
    calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
    camera: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 16.500a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7z'],
    scan: ['M4 8V5h3', 'M17 5h3v3', 'M20 16v3h-3', 'M7 19H4v-3', 'M8 9v6', 'M12 9v6', 'M16 9v6'],
    clock: ['M12 20.500a8.500 8.500 0 1 0 0-17 8.500 8.500 0 0 0 0 17z', 'M12 7.500V12l3 2'],
    phone: ['M6 3h4l2 5-2.500 1.500a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z'],
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
/**
 * The driver's status, floating over the map. Each state has its own colour for
 * fill, border and text, and its own leading glyph, so it is never told by
 * colour alone: online is green with a filled disc, offline is red with a power
 * mark, on a break is amber with a pause mark.
 */
export function DutyChip({ duty, onPress, t, dark, since }: { duty: DutyState; onPress?: () => void; t: Translate; dark?: boolean; since?: string | null }) {
    const skin = useChipSkin(dark);
    const theme = useTheme();
    const label = t(`home.duty.${duty}`);
    const tone = duty === 'on' ? 'success' : duty === 'break' ? 'warning' : 'danger';
    const ink = (duty === 'on' ? theme.successText?.val : duty === 'break' ? theme.warningText?.val : theme.dangerText?.val) as string;
    const mark =
        duty === 'on' ? (
            <YStack width={12} height={12} borderRadius={6} backgroundColor={ink as never} />
        ) : duty === 'break' ? (
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={3.4} strokeLinecap="round">
                <Path d="M8 5v14M16 5v14" />
            </Svg>
        ) : (
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={2.8} strokeLinecap="round">
                <Path d="M12 3v8M6.5 6.5a8 8 0 1 0 11 0" />
            </Svg>
        );
    return (
        <YStack alignItems="flex-end" gap={space[1]} flexShrink={0}>
            <XStack
                height={44}
                alignItems="center"
                gap={space[2]}
                paddingHorizontal={14}
                borderRadius={22}
                borderWidth={1.5}
                borderColor={ink as never}
                onPress={onPress}
                pressStyle={{ opacity: 0.7 }}
                accessibilityRole="button"
                accessibilityLabel={t('home.duty.change', { status: label })}
                testID="home-duty"
                {...skin}
            >
                {/* The state's tint sits on the chip's own solid ground, so it reads over any map. */}
                <YStack position="absolute" top={0} right={0} bottom={0} left={0} borderRadius={22} backgroundColor={`$${tone}Fill` as never} pointerEvents="none" />
                {mark}
                <Body fontSize={14} lineHeight={18} fontWeight="800" tone={tone} numberOfLines={1}>
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
export function OrgChip({ name, dark, onPress }: { name: string; dark?: boolean; /** Opens the organisation switcher. */ onPress?: () => void }) {
    const skin = useChipSkin(dark);
    const ink = useTheme().textSecondary?.val as string;
    if (!name) return <YStack />;
    return (
        <XStack flexShrink={1} height={44} alignItems="center" gap={10} paddingLeft={6} paddingRight={14} borderRadius={22} borderWidth={1} borderColor="$border" onPress={onPress} pressStyle={onPress ? { opacity: 0.7 } : undefined} accessibilityRole={onPress ? 'button' : undefined} testID="home-organization" {...skin}>
            <YStack width={32} height={32} borderRadius={16} backgroundColor="$primary" alignItems="center" justifyContent="center">
                <Body fontSize={14} lineHeight={18} fontWeight="800" tone="onPrimary">
                    {name.trim().charAt(0).toUpperCase()}
                </Body>
            </YStack>
            <Body flexShrink={1} fontSize={15} lineHeight={20} fontWeight="700" numberOfLines={1}>
                {name}
            </Body>
            {/* A small chevron says the chip opens something. */}
            {onPress ? (
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M6 9l6 6 6-6" />
                </Svg>
            ) : null}
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

/* -- The week ---------------------------------------------------------------- */

export interface WeekBar {
    key: string;
    /** One or two letters for the day. */
    label: string;
    value: number;
    today?: boolean;
    /** A day still to come: drawn as an empty slot. */
    future?: boolean;
}

/**
 * Seven bars, one per day, today's in the brand colour. The bars are a picture
 * of the figures under them, which say the same in numbers, so the bars are
 * hidden from screen readers.
 */
export function WeekCard({ title, range, bars, stats, testID }: { title: string; /** The dates the week covers, at the title's right. */ range?: string; bars: WeekBar[]; stats: Stat[]; testID?: string }) {
    const peak = Math.max(1, ...bars.map((bar) => bar.value));
    const HEIGHT = 64;
    return (
        <Card testID={testID}>
            <YStack gap={14}>
                <XStack alignItems="baseline" justifyContent="space-between" gap={space[3]}>
                    <YStack flexShrink={1}>
                        <SectionLabel>{title}</SectionLabel>
                    </YStack>
                    {range ? (
                        <Secondary fontSize={12} lineHeight={16} fontWeight="600" tabular numberOfLines={1}>
                            {range}
                        </Secondary>
                    ) : null}
                </XStack>
                <XStack alignItems="flex-end" gap={8} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    {bars.map((bar) => (
                        <YStack key={bar.key} flex={1} alignItems="center" gap={6}>
                            <Body fontSize={12} lineHeight={16} tabular fontWeight={bar.today ? '800' : '700'} tone={bar.today ? 'primary' : 'muted'}>
                                {bar.value > 0 ? String(bar.value) : ' '}
                            </Body>
                            <YStack width="100%" height={HEIGHT} justifyContent="flex-end">
                                <YStack
                                    height={bar.value > 0 ? Math.max(6, Math.round((bar.value / peak) * HEIGHT)) : 4}
                                    borderRadius={6}
                                    backgroundColor={bar.today && bar.value > 0 ? '$primary' : bar.value > 0 ? '$textMuted' : '$border'}
                                    opacity={bar.today || bar.value === 0 ? 1 : 0.55}
                                />
                            </YStack>
                            <Body fontSize={12} lineHeight={16} fontWeight={bar.today ? '800' : '600'} tone={bar.today ? 'brand' : 'muted'} opacity={bar.future ? 0.6 : 1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                                {bar.label}
                            </Body>
                        </YStack>
                    ))}
                </XStack>
                {stats.length ? (
                    <XStack gap={space[2]} paddingTop={12} borderTopWidth={1} borderTopColor="$border">
                        {stats.map((stat) => (
                            <StatTile key={stat.key} stat={stat} size={20} />
                        ))}
                    </XStack>
                ) : null}
            </YStack>
        </Card>
    );
}

/* -- Shortcuts --------------------------------------------------------------- */

export interface Shortcut {
    key: string;
    icon: HomeIconName;
    label: string;
    onPress?: () => void;
    tone?: 'warning';
}

/** The things a driver does between jobs, one tap each. */
export function Shortcuts({ items, testID }: { items: Shortcut[]; testID?: string }) {
    const theme = useTheme();
    const shown = items.filter((item) => !!item.onPress);
    if (!shown.length) return null;
    return (
        <XStack gap={10} testID={testID}>
            {shown.map((item) => (
                <YStack
                    key={item.key}
                    flex={1}
                    flexBasis={0}
                    minHeight={86}
                    paddingVertical={12}
                    paddingHorizontal={8}
                    alignItems="center"
                    justifyContent="center"
                    gap={8}
                    borderRadius={CARD_RADIUS}
                    borderWidth={1}
                    borderColor={item.tone === 'warning' ? '$warningBorder' : '$border'}
                    backgroundColor={item.tone === 'warning' ? '$warningFill' : '$surface'}
                    onPress={item.onPress}
                    pressStyle={{ opacity: 0.7 }}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    testID={`home-shortcut-${item.key}`}
                >
                    <HomeIcon name={item.icon} color={(item.tone === 'warning' ? theme.warningText?.val : theme.primary?.val) as string} size={22} />
                    <Body fontSize={13} lineHeight={17} fontWeight="700" textAlign="center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {item.label}
                    </Body>
                </YStack>
            ))}
        </XStack>
    );
}

/* -- A job, in one card -------------------------------------------------------- */

/** An order named in a line or two: the next one scheduled, or the last one finished. */
export function JobCard({ eyebrow, icon, title, lines = [], mono, value, onPress, testID }: { eyebrow: string; icon: HomeIconName; title: string; lines?: (string | undefined)[]; mono?: string; value?: string; onPress?: () => void; testID?: string }) {
    const theme = useTheme();
    return (
        <Card onPress={onPress} testID={testID} label={[eyebrow, title].join('. ')}>
            <XStack alignItems="flex-start" gap={space[3]}>
                <YStack width={36} height={36} borderRadius={10} flexShrink={0} backgroundColor="$surfaceRaised" alignItems="center" justifyContent="center">
                    <HomeIcon name={icon} color={theme.textSecondary?.val as string} size={18} />
                </YStack>
                <YStack flex={1} gap={2} minWidth={0}>
                    <SectionLabel>{eyebrow}</SectionLabel>
                    <Body fontSize={16} lineHeight={21} fontWeight="700" numberOfLines={2}>
                        {title}
                    </Body>
                    {lines.filter(Boolean).map((line) => (
                        <Secondary key={line} fontSize={13} lineHeight={18} numberOfLines={2}>
                            {line}
                        </Secondary>
                    ))}
                    {mono ? (
                        <Secondary fontFamily="$mono" fontSize={12} lineHeight={16}>
                            {mono}
                        </Secondary>
                    ) : null}
                </YStack>
                {value ? (
                    <Body fontSize={15} lineHeight={20} fontWeight="700" tabular flexShrink={0}>
                        {value}
                    </Body>
                ) : onPress ? (
                    <HomeIcon name="chevron" color={theme.textSecondary?.val as string} size={18} />
                ) : null}
            </XStack>
        </Card>
    );
}

/* -- Facts about a waypoint, as chips ----------------------------------------- */

export interface FactChip {
    key: string;
    icon: HomeIconName;
    label: string;
    tone?: 'warning';
}

/** What this waypoint asks of the driver, at a glance: items, cash, proof, a note. */
export function FactChips({ chips, testID }: { chips: FactChip[]; testID?: string }) {
    const theme = useTheme();
    if (!chips.length) return null;
    return (
        <XStack flexWrap="wrap" gap={8} testID={testID}>
            {chips.map((chip) => (
                <XStack
                    key={chip.key}
                    alignItems="center"
                    gap={6}
                    height={32}
                    paddingHorizontal={10}
                    borderRadius={16}
                    borderWidth={1}
                    borderColor={chip.tone === 'warning' ? '$warningBorder' : '$border'}
                    backgroundColor={chip.tone === 'warning' ? '$warningFill' : '$surface'}
                    testID={`home-fact-${chip.key}`}
                >
                    <HomeIcon name={chip.icon} color={(chip.tone === 'warning' ? theme.warningText?.val : theme.textSecondary?.val) as string} size={15} />
                    <Body fontSize={13} lineHeight={17} fontWeight="700" tabular tone={chip.tone === 'warning' ? 'warning' : 'primary'}>
                        {chip.label}
                    </Body>
                </XStack>
            ))}
        </XStack>
    );
}

/**
 * The rail between two waypoints still to drive: a column of dots that fills
 * the height of the row. Drawn as dots because a dotted border on one side of a
 * view is not drawn on iOS.
 */
function DottedRail() {
    return (
        <YStack flexGrow={1} minHeight={18} marginTop={4} marginBottom={3} overflow="hidden" alignItems="center" gap={5}>
            {Array.from({ length: 24 }, (_, index) => (
                <YStack key={index} width={4} height={4} borderRadius={2} backgroundColor="$textMuted" opacity={0.7} />
            ))}
        </YStack>
    );
}

/* -- The trip: an order as one journey ----------------------------------------- */

export interface TripPoint {
    key: string;
    kind?: 'pickup' | 'dropoff' | 'waypoint';
    /** The number inside a waypoint's marker. */
    number?: number;
    /** The order's colour, as the console draws it. */
    color?: string;
    state: 'done' | 'current' | 'pending' | 'skipped';
    /** "PICKUP", "DROP-OFF", "WAYPOINT 2". */
    label: string;
    title: string;
    address?: string;
    /** "Arrive 14:27", "Due by 15:30". */
    time?: string;
    /** A word on the time, with its tone: "In window", "Late". */
    timeNote?: { text: string; tone: 'success' | 'danger' };
    /** The road to the next point: "then 2.6 km". */
    legAfter?: string;
    onPress?: () => void;
}

/**
 * The order drawn as the drive it is: the driver, then each waypoint in order,
 * joined by a rail. The leg being driven is solid and in the brand colour; the
 * legs after it are dotted. Markers are the console's.
 */
export function TripCard({
    eyebrow,
    tracking,
    status,
    you,
    points,
    testID,
}: {
    eyebrow: string;
    tracking?: string;
    /** A short tag at the top right: "Heading to pickup". */
    status?: string;
    /** The driver's own row; left out when offline. */
    you?: { title: string; plate?: string; leg?: string };
    points: TripPoint[];
    testID?: string;
}) {
    const theme = useTheme();
    const RAIL = 44;
    return (
        <YStack gap={12} testID={testID}>
            <XStack alignItems="center" justifyContent="space-between" gap={space[3]}>
                <YStack flex={1} gap={1} minWidth={0}>
                    <SectionLabel tone="brand" weight="700">
                        {eyebrow}
                    </SectionLabel>
                    {tracking ? (
                        <Body fontFamily="$mono" fontSize={17} lineHeight={22} fontWeight="600" selectable testID="home-trip-tracking">
                            {tracking}
                        </Body>
                    ) : null}
                </YStack>
                {status ? (
                    <XStack flexShrink={0} alignItems="center" gap={5} height={26} paddingHorizontal={9} borderRadius={13} borderWidth={1} borderColor="$primaryBorder" backgroundColor="$primaryFill">
                        <HomeIcon name="navigate" color={theme.primary?.val as string} size={10} />
                        <Body fontSize={11} lineHeight={15} fontWeight="800" tone="brand" numberOfLines={1}>
                            {status}
                        </Body>
                    </XStack>
                ) : null}
            </XStack>

            <Card>
                {you ? (
                    <XStack gap={12}>
                        <YStack width={RAIL} alignItems="center">
                            <YStack width={22} height={22} borderRadius={11} backgroundColor="$primary" borderWidth={3} borderColor="$white" />
                            <YStack flexGrow={1} width={4} borderRadius={2} backgroundColor="$primary" marginVertical={3} minHeight={18} />
                        </YStack>
                        <YStack flex={1} gap={6} minWidth={0} paddingBottom={10}>
                            <XStack alignItems="baseline" justifyContent="space-between" gap={10}>
                                <Body flexShrink={1} fontSize={14} lineHeight={22} fontWeight="700" tone="secondary" numberOfLines={1}>
                                    {you.title}
                                </Body>
                                {you.plate ? (
                                    <Secondary fontFamily="$mono" fontSize={13} flexShrink={0}>
                                        {you.plate}
                                    </Secondary>
                                ) : null}
                            </XStack>
                            {you.leg ? (
                                <XStack alignSelf="flex-start" alignItems="center" gap={7} height={28} paddingHorizontal={11} borderRadius={14} borderWidth={1} borderColor="$primaryBorder" backgroundColor="$primaryFill">
                                    <HomeIcon name="navigate" color={theme.primary?.val as string} size={12} />
                                    <Body fontSize={14} lineHeight={18} fontWeight="800" tabular numberOfLines={1}>
                                        {you.leg}
                                    </Body>
                                </XStack>
                            ) : null}
                        </YStack>
                    </XStack>
                ) : null}

                {points.map((point, index) => {
                    const last = index === points.length - 1;
                    const quiet = point.state === 'done' || point.state === 'skipped';
                    return (
                        <XStack key={point.key} gap={12} onPress={point.onPress} pressStyle={point.onPress ? { opacity: 0.7 } : undefined} accessibilityRole={point.onPress ? 'button' : undefined} testID={`home-trip-${point.key}`}>
                            <YStack width={RAIL} alignItems="center">
                                <StopBadge kind={point.kind} number={point.number} color={point.color} state={point.state} />
                                {last ? null : <DottedRail />}
                            </YStack>
                            <YStack flex={1} minWidth={0} paddingTop={point.state === 'current' ? 6 : 2} paddingBottom={last ? 0 : 10} opacity={quiet ? 0.6 : 1}>
                                <SectionLabel tone={point.state === 'current' ? 'success' : 'muted'}>{point.label}</SectionLabel>
                                <Body fontSize={17} lineHeight={22} fontWeight="800" numberOfLines={2}>
                                    {point.title}
                                </Body>
                                {point.address ? (
                                    <Secondary fontSize={13} lineHeight={17} numberOfLines={2}>
                                        {point.address}
                                    </Secondary>
                                ) : null}
                                {point.time || point.timeNote ? (
                                    <XStack alignItems="center" flexWrap="wrap" columnGap={10} rowGap={4} paddingTop={5}>
                                        {point.time ? (
                                            <Body fontSize={15} lineHeight={20} fontWeight="800" tabular>
                                                {point.time}
                                            </Body>
                                        ) : null}
                                        {point.timeNote ? (
                                            <XStack alignItems="center" gap={5}>
                                                <HomeIcon name={point.timeNote.tone === 'success' ? 'tick' : 'issue'} color={(point.timeNote.tone === 'success' ? theme.successText?.val : theme.dangerText?.val) as string} size={13} />
                                                <Body fontSize={13} lineHeight={17} fontWeight="700" tabular tone={point.timeNote.tone}>
                                                    {point.timeNote.text}
                                                </Body>
                                            </XStack>
                                        ) : null}
                                    </XStack>
                                ) : null}
                                {point.legAfter ? (
                                    <Secondary fontSize={12} lineHeight={16} fontWeight="700" tabular paddingTop={10}>
                                        {point.legAfter}
                                    </Secondary>
                                ) : null}
                            </YStack>
                        </XStack>
                    );
                })}
            </Card>
        </YStack>
    );
}

/* -- Who the order is for, and what they said ---------------------------------- */

/** The customer, with the two ways to reach them. */
export function CustomerCard({ label, name, messageLabel, callLabel, unread, onMessage, onCall, testID }: { label: string; name: string; messageLabel: string; callLabel: string; unread?: number; onMessage?: () => void; onCall?: () => void; testID?: string }) {
    const theme = useTheme();
    const initials = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');
    const action = (key: string, icon: HomeIconName, text: string, onPress: () => void, badge?: number) => (
        <XStack
            key={key}
            alignItems="center"
            gap={6}
            height={40}
            paddingHorizontal={12}
            borderRadius={12}
            borderWidth={1}
            borderColor="$border"
            backgroundColor="$surfaceRaised"
            onPress={onPress}
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityLabel={text}
            testID={`home-customer-${key}`}
        >
            <HomeIcon name={icon} color={theme.primary?.val as string} size={16} />
            <Body fontSize={14} lineHeight={18} fontWeight="700" numberOfLines={1}>
                {text}
            </Body>
            {badge ? (
                <YStack minWidth={18} height={18} paddingHorizontal={5} borderRadius={9} backgroundColor="$primary" alignItems="center" justifyContent="center">
                    <Body fontSize={11} lineHeight={14} fontWeight="800" tone="onPrimary" tabular>
                        {badge > 99 ? '99+' : String(badge)}
                    </Body>
                </YStack>
            ) : null}
        </XStack>
    );
    return (
        <Card testID={testID}>
            <XStack alignItems="center" gap={space[3]}>
                <YStack width={40} height={40} borderRadius={20} flexShrink={0} backgroundColor="$surfaceRaised" borderWidth={1} borderColor="$border" alignItems="center" justifyContent="center">
                    <Body fontSize={14} lineHeight={18} fontWeight="800" tone="secondary">
                        {initials || '?'}
                    </Body>
                </YStack>
                <YStack flex={1} gap={1} minWidth={0}>
                    <SectionLabel>{label}</SectionLabel>
                    <Body fontSize={16} lineHeight={21} fontWeight="700" numberOfLines={1}>
                        {name}
                    </Body>
                </YStack>
                <XStack gap={8} flexShrink={0}>
                    {onMessage ? action('message', 'chat', messageLabel, onMessage, unread) : null}
                    {onCall ? action('call', 'phone', callLabel, onCall) : null}
                </XStack>
            </XStack>
        </Card>
    );
}

/** A note from dispatch or the customer, in full: it is there to be read before arriving. */
export function NoteCard({ label, text, testID }: { label: string; text: string; testID?: string }) {
    const theme = useTheme();
    return (
        <YStack padding={14} gap={6} borderRadius={CARD_RADIUS} borderWidth={1} borderColor="$warningBorder" backgroundColor="$warningFill" testID={testID}>
            <XStack alignItems="center" gap={6}>
                <HomeIcon name="note" color={theme.warningText?.val as string} size={14} />
                <Caption fontSize={12} lineHeight={16} fontWeight="800" letterSpacing={0.7} tone="warning" numberOfLines={1}>
                    {label.toUpperCase()}
                </Caption>
            </XStack>
            <Body fontSize={15} lineHeight={21} selectable>
                {text}
            </Body>
        </YStack>
    );
}
