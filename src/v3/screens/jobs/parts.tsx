/**
 * Small pieces the Jobs and Order screens share — design round 3.
 *
 * Nothing here knows about orders or manifests: these are the capsule switch,
 * the section label, the waypoint mark and the like, drawn the way the mockups
 * draw them so the three Jobs views and the order screen read as one product.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Caption } from '../../ui/Text';
import { useResolvedScheme } from '../../settings';
import type { OrderMark, PointState } from './model';

export const GUTTER = 16;
export const CARD_RADIUS = 18;
export const CARD_PADDING = 14;

/* -- Text. ----------------------------------------------------------------- */

/** 12/800, tracked, upper case: the label over every section and card. */
export function SectionLabel({ children, tone = 'muted', testID }: { children: React.ReactNode; tone?: 'muted' | 'brand' | 'success' | 'warning' | 'danger'; testID?: string }) {
    return (
        <Caption fontSize={12} fontWeight="800" letterSpacing={0.7} textTransform="uppercase" tone={tone} testID={testID}>
            {children}
        </Caption>
    );
}

/** A section: its label, an optional note on the right, and the content. */
export function Section({ label, aside, children, testID }: { label: string; aside?: React.ReactNode; children: React.ReactNode; testID?: string }) {
    return (
        <YStack gap={10} testID={testID}>
            <XStack alignItems="baseline" justifyContent="space-between" gap={12}>
                <YStack flex={1}>
                    <SectionLabel>{label}</SectionLabel>
                </YStack>
                {aside}
            </XStack>
            {children}
        </YStack>
    );
}

/** The round 3 card: radius 18, padding 14, surface with a hairline border. */
export function Card({ children, padded = true, active, testID, onPress, accessibilityLabel, ...rest }: { children: React.ReactNode; padded?: boolean; active?: boolean; testID?: string; onPress?: () => void; accessibilityLabel?: string } & Record<string, unknown>) {
    return (
        <YStack
            borderRadius={CARD_RADIUS}
            backgroundColor={active ? '$primaryFill' : '$surface'}
            borderWidth={active ? 1.5 : 1}
            borderColor={active ? '$primary' : '$border'}
            padding={padded ? CARD_PADDING : 0}
            overflow="hidden"
            onPress={onPress}
            pressStyle={onPress ? { opacity: 0.75 } : undefined}
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={accessibilityLabel}
            testID={testID}
            {...rest}
        >
            {children}
        </YStack>
    );
}

/* -- Switches and chips. ---------------------------------------------------- */

/**
 * The capsule switch: Route / Orders / Map on Jobs, Overview / Details on an
 * order. `stretch` shares the width evenly, as the order screen's does.
 */
export function ModeSwitch<T extends string>({
    options,
    value,
    onChange,
    stretch,
    label,
    testID,
}: {
    options: { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
    stretch?: boolean;
    label: string;
    testID?: string;
}) {
    return (
        <XStack gap={4} padding={4} borderRadius={16} backgroundColor="$surface" borderWidth={1} borderColor="$border" accessibilityRole="tablist" accessibilityLabel={label} testID={testID}>
            {options.map((option) => {
                const on = option.value === value;
                return (
                    <YStack
                        key={option.value}
                        flex={stretch ? 1 : undefined}
                        height={stretch ? 40 : 36}
                        paddingHorizontal={14}
                        borderRadius={12}
                        alignItems="center"
                        justifyContent="center"
                        backgroundColor={on ? '$textPrimary' : 'transparent'}
                        onPress={() => onChange(option.value)}
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                        testID={testID ? `${testID}-${option.value}` : undefined}
                    >
                        <Body fontSize={stretch ? 15 : 14} fontWeight={on ? '800' : '700'} color={on ? '$background' : '$textSecondary'} numberOfLines={1}>
                            {option.label}
                        </Body>
                    </YStack>
                );
            })}
        </XStack>
    );
}

/**
 * The Jobs tabs: Orders · Route · Map · Schedule. One compact control, 40 high,
 * the four parts sharing the width, labels as words.
 */
export function JobsTabs<T extends string>({ options, value, onChange, label, testID }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void; label: string; testID?: string }) {
    return (
        <XStack gap={2} padding={3} borderRadius={13} backgroundColor="$surface" borderWidth={1} borderColor="$border" accessibilityRole="tablist" accessibilityLabel={label} testID={testID}>
            {options.map((option) => {
                const on = option.value === value;
                return (
                    <YStack
                        key={option.value}
                        flex={1}
                        flexBasis={0}
                        minWidth={0}
                        height={32}
                        borderRadius={10}
                        alignItems="center"
                        justifyContent="center"
                        backgroundColor={on ? '$textPrimary' : 'transparent'}
                        onPress={() => onChange(option.value)}
                        // The part is 32 high inside a 40-high control; the touch reaches the control's edge and beyond.
                        hitSlop={{ top: 8, bottom: 8 }}
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                        testID={testID ? `${testID}-${option.value}` : undefined}
                    >
                        <Body fontSize={15} lineHeight={20} fontWeight={on ? '800' : '700'} color={on ? '$background' : '$textSecondary'} numberOfLines={1}>
                            {option.label}
                        </Body>
                    </YStack>
                );
            })}
        </XStack>
    );
}

/** The small chip switch inside Schedule: Dates · Day · Week · Month. */
export function ChipSwitch<T extends string>({ options, value, onChange, label, testID }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void; label: string; testID?: string }) {
    return (
        <XStack gap={6} accessibilityRole="tablist" accessibilityLabel={label} testID={testID}>
            {options.map((option) => {
                const on = option.value === value;
                return (
                    <YStack
                        key={option.value}
                        height={30}
                        paddingHorizontal={13}
                        borderRadius={15}
                        alignItems="center"
                        justifyContent="center"
                        borderWidth={1}
                        borderColor={on ? '$primary' : '$border'}
                        backgroundColor={on ? '$primaryFill' : 'transparent'}
                        onPress={() => onChange(option.value)}
                        hitSlop={{ top: 9, bottom: 9, left: 3, right: 3 }}
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                        testID={testID ? `${testID}-${option.value}` : undefined}
                    >
                        <Body fontSize={14} lineHeight={18} fontWeight={on ? '800' : '700'} color={on ? '$textPrimary' : '$textSecondary'} numberOfLines={1}>
                            {option.label}
                        </Body>
                    </YStack>
                );
            })}
        </XStack>
    );
}

/** A heading over a list with a count or a figure at its right: "Next today" · "2 orders". */
export function ListHeading({ title, aside, testID }: { title: string; aside?: string; testID?: string }) {
    return (
        <XStack alignItems="baseline" justifyContent="space-between" gap={12} testID={testID}>
            <Body flexShrink={1} fontSize={20} lineHeight={26} fontWeight="800" letterSpacing={-0.2} numberOfLines={1} accessibilityRole="header">
                {title}
            </Body>
            {aside ? (
                <Body flexShrink={0} fontSize={15} lineHeight={26} fontWeight="700" tabular tone="secondary" numberOfLines={1}>
                    {aside}
                </Body>
            ) : null}
        </XStack>
    );
}

/** A round 48 button with an arrow: previous / next day, week or month. */
export function ArrowButton({ direction, label, onPress, testID }: { direction: 'previous' | 'next'; label: string; onPress: () => void; testID?: string }) {
    return (
        <YStack
            width={48}
            height={48}
            borderRadius={24}
            alignItems="center"
            justifyContent="center"
            borderWidth={1}
            borderColor="$border"
            backgroundColor="$surface"
            onPress={onPress}
            pressStyle={{ opacity: 0.6 }}
            accessibilityRole="button"
            accessibilityLabel={label}
            testID={testID}
        >
            <Glyph name={direction === 'previous' ? 'chevronLeft' : 'chevron'} size={18} strokeWidth={2.8} />
        </YStack>
    );
}

/** A filter pill: filled when it is the one in force. */
export function FilterChip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
    return (
        <YStack
            height={36}
            paddingHorizontal={14}
            borderRadius={18}
            alignItems="center"
            justifyContent="center"
            backgroundColor={on ? '$textPrimary' : 'transparent'}
            borderWidth={on ? 0 : 1}
            borderColor="$border"
            onPress={onPress}
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            testID={testID}
        >
            <Body fontSize={14} fontWeight="700" tabular color={on ? '$background' : '$textSecondary'} numberOfLines={1}>
                {label}
            </Body>
        </YStack>
    );
}

/* -- Icons. ------------------------------------------------------------------ */

export type GlyphName = 'chevron' | 'chevronLeft' | 'chevronDown' | 'search' | 'locate' | 'fit' | 'reorder' | 'navigate' | 'call' | 'message' | 'share' | 'send' | 'cash' | 'box' | 'list' | 'close' | 'bolt' | 'play' | 'check' | 'clock';

/** Drawn filled, not stroked. */
const FILLED: ReadonlySet<GlyphName> = new Set<GlyphName>(['navigate', 'bolt', 'play']);

const GLYPHS: Record<Exclude<GlyphName, 'search' | 'locate' | 'cash' | 'share' | 'clock'>, string> = {
    chevron: 'M9 5l7 7-7 7',
    chevronLeft: 'M15 5l-7 7 7 7',
    bolt: 'M13 2L5 13h6l-1 9 9-12h-6z',
    play: 'M6 3l15 9-15 9z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    chevronDown: 'M6 9l6 6 6-6',
    fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    reorder: 'M4 7h11l-3-3M20 17H9l3 3',
    navigate: 'M12 2l8 19-8-4-8 4z',
    call: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z',
    message: 'M12 4c4.7 0 8.5 3.3 8.5 7.500S16.700 19 12 19c-1 0-2-.15-2.9-.45L4 20l1.300-4.200A7 7 0 0 1 3.500 11.500C3.500 7.300 7.300 4 12 4z',
    send: 'M12 19V5M6 11l6-6 6 6',
    box: 'M12 3l8 4.500v9L12 21l-8-4.500v-9zM4 7.500l8 4.500 8-4.500M12 12v9',
    list: 'M5 6h9M5 12h14M5 18h7M18 6h.01M16 18h.01',
    close: 'M6 6l12 12M18 6L6 18',
};

/** Line icons from the mockups, stroked in a theme colour. */
export function Glyph({ name, size = 20, color, strokeWidth = 2.2 }: { name: GlyphName; size?: number; color?: string; strokeWidth?: number }) {
    const theme = useTheme();
    const stroke = color ?? (theme.textPrimary?.val as string);
    const common = { fill: 'none', stroke, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
            {name === 'search' ? (
                <>
                    <Circle cx={11} cy={11} r={6.5} {...common} />
                    <Path d="M16 16l4 4" {...common} />
                </>
            ) : name === 'locate' ? (
                <>
                    <Circle cx={12} cy={12} r={6} {...common} />
                    <Path d="M12 2v4M12 18v4M2 12h4M18 12h4" {...common} />
                </>
            ) : name === 'cash' ? (
                <>
                    <Rect x={3} y={6} width={18} height={12} rx={3} {...common} />
                    <Circle cx={12} cy={12} r={2.5} {...common} />
                </>
            ) : name === 'share' ? (
                <>
                    <Rect x={8} y={8} width={12} height={12} rx={3} {...common} />
                    <Path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" {...common} />
                </>
            ) : name === 'clock' ? (
                <>
                    <Circle cx={12} cy={12} r={9} {...common} />
                    <Path d="M12 7v5l3 2" {...common} />
                </>
            ) : FILLED.has(name) ? (
                <Path d={GLYPHS[name as 'navigate' | 'bolt' | 'play']} fill={stroke} />
            ) : (
                <Path d={GLYPHS[name]} {...common} />
            )}
        </Svg>
    );
}

/** A square or round icon-only control, 44–48dp, always with a spoken label. */
export function IconButton({
    name,
    label,
    onPress,
    size = 48,
    round,
    filled,
    overMap,
    disabled,
    testID,
}: {
    name: GlyphName;
    label: string;
    onPress?: () => void;
    size?: number;
    round?: boolean;
    /** The one accent control, e.g. "post comment". */
    filled?: boolean;
    /** Sits on a map: an opaque backing so it reads over any tile. */
    overMap?: boolean;
    disabled?: boolean;
    testID?: string;
}) {
    const theme = useTheme();
    return (
        <YStack
            width={size}
            height={size}
            borderRadius={round ? size / 2 : 14}
            alignItems="center"
            justifyContent="center"
            backgroundColor={filled ? '$primary' : overMap ? '$background' : '$surfaceRaised'}
            borderWidth={filled ? 0 : 1}
            borderColor="$border"
            opacity={disabled ? 0.4 : 1}
            onPress={disabled ? undefined : onPress}
            pressStyle={{ opacity: 0.6 }}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !!disabled }}
            testID={testID}
        >
            <Glyph name={name} size={size >= 48 ? 20 : 18} color={filled ? (theme.onPrimary?.val as string) : undefined} strokeWidth={filled ? 2.6 : 2.2} />
        </YStack>
    );
}

/* -- Waypoint marks. --------------------------------------------------------- */

/**
 * The mark beside a waypoint. State is never colour alone: done is a round
 * green tick, the one being headed to is a filled square with its number,
 * later is an outlined square, skipped is an outlined square with a dash.
 */
export function WaypointMark({ state, label, size = 36 }: { state: PointState; label?: string | number; size?: number }) {
    const done = state === 'done';
    const current = state === 'current';
    const fontSize = Math.round(size * 0.42);
    return (
        <YStack
            width={size}
            height={size}
            borderRadius={done ? size / 2 : Math.round(size * 0.31)}
            alignItems="center"
            justifyContent="center"
            backgroundColor={done ? '$success' : current ? '$primary' : 'transparent'}
            borderWidth={done || current ? 0 : 1.5}
            borderColor="$textMuted"
            borderStyle={state === 'skipped' ? 'dashed' : 'solid'}
        >
            <Body fontSize={fontSize} lineHeight={fontSize + 4} fontWeight="800" tabular color={done ? '$background' : current ? '$onPrimary' : '$textSecondary'}>
                {done ? '✓' : state === 'skipped' ? '–' : (label ?? '')}
            </Body>
        </YStack>
    );
}

/**
 * The small marker inside an order card: the console's marker at 26, so a card
 * with five places stays a card. P, D, R or the waypoint's number; done is
 * dimmed, the one being headed to has a ring, skipped is hollow with a dash.
 */
export function SmallMark({ label, color, state = 'later', size = 26 }: { label: string; color: string; state?: PointState; size?: number }) {
    const skipped = state === 'skipped';
    return (
        <YStack width={size} height={size} alignItems="center" justifyContent="center">
            {state === 'current' ? <YStack position="absolute" width={size + 8} height={size + 8} borderRadius={(size + 8) / 2} backgroundColor={color as never} opacity={0.3} /> : null}
            <YStack
                width={size}
                height={size}
                borderRadius={size / 2}
                borderWidth={2}
                borderColor={(skipped ? color : '#FFFFFF') as never}
                backgroundColor={(skipped ? '#FFFFFF' : color) as never}
                opacity={state === 'done' ? 0.55 : 1}
                alignItems="center"
                justifyContent="center"
            >
                <Body fontSize={size >= 26 ? 12 : 11} lineHeight={size >= 26 ? 15 : 14} fontWeight="800" tabular color={(skipped ? color : '#FFFFFF') as never}>
                    {skipped ? '–' : label}
                </Body>
            </YStack>
        </YStack>
    );
}

/**
 * The rail under a small marker. Dotted ahead of the driver, solid green behind.
 * The dots are views laid over the slot (a dotted border on one side of a view
 * is not drawn on iOS), so the rail takes the row's height and never adds to it.
 */
export function SmallRail({ done, minHeight = 10 }: { done?: boolean; minHeight?: number }) {
    const color = useTheme().textMuted?.val as string;
    if (done) return <YStack flexGrow={1} width={3} minHeight={minHeight} backgroundColor="$success" />;
    return (
        <View style={{ flexGrow: 1, minHeight, width: 3, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', top: 1, left: 0, width: 3 }}>
                {Array.from({ length: 40 }, (_, index) => (
                    <View key={index} style={{ width: 3, height: 3, borderRadius: 1.5, marginBottom: 3, backgroundColor: color, opacity: 0.7 }} />
                ))}
            </View>
        </View>
    );
}

/**
 * The colours of a "this is the one in hand" tag. On the dark scheme they are
 * the mockup's own deep blue pill with pale blue words; every other scheme
 * takes the brand tint from its tokens (night is amber only, light needs ink
 * that holds on white).
 */
export function useBrandTag(): { fill: string; border: string; ink: string } {
    const theme = useTheme();
    const scheme = useResolvedScheme();
    return scheme === 'dark'
        ? { fill: '#13203A', border: '#2E4F9E', ink: '#9DBBFF' }
        : { fill: theme.primaryFill?.val as string, border: theme.primaryBorder?.val as string, ink: theme.primary?.val as string };
}

/** A 28-high pill with a small icon and a word: an order's state, never colour alone. */
export function TagPill({ label, icon, tone = 'neutral', testID }: { label: string; icon: GlyphName; tone?: 'neutral' | 'brand' | 'success'; testID?: string }) {
    const theme = useTheme();
    const brand = useBrandTag();
    const look =
        tone === 'brand'
            ? brand
            : tone === 'success'
              ? { fill: theme.successFill?.val as string, border: theme.successBorder?.val as string, ink: theme.successText?.val as string }
              : { fill: theme.surfaceRaised?.val as string, border: theme.border?.val as string, ink: theme.textSecondary?.val as string };
    return (
        <XStack flexShrink={0} height={28} alignItems="center" gap={6} paddingHorizontal={10} borderRadius={14} borderWidth={1} borderColor={look.border as never} backgroundColor={look.fill as never} testID={testID}>
            <Glyph name={icon} size={icon === 'navigate' ? 11 : 10} color={look.ink} strokeWidth={3.2} />
            <Body fontSize={12} lineHeight={16} fontWeight="800" color={look.ink as never} numberOfLines={1}>
                {label}
            </Body>
        </XStack>
    );
}

/** A fact at the foot of a card: "3 waypoints", "5 items", "MNT 48,000 cash". */
export function FootChip({ label, tone, icon, large }: { label: string; tone?: 'warning'; icon?: GlyphName; large?: boolean }) {
    const theme = useTheme();
    return (
        <XStack height={large ? 32 : 28} alignItems="center" gap={6} paddingHorizontal={large ? 12 : 10} borderRadius={large ? 16 : 14} backgroundColor="$surfaceRaised">
            {icon ? <Glyph name={icon} size={15} strokeWidth={2.4} color={(tone === 'warning' ? theme.warningText?.val : theme.textSecondary?.val) as string} /> : null}
            <Body fontSize={large ? 15 : 13} lineHeight={large ? 20 : 17} fontWeight="700" tabular numberOfLines={1} color={tone === 'warning' ? '$warningText' : '$textPrimary'}>
                {label}
            </Body>
        </XStack>
    );
}

/** The join between two marks: solid green behind the driver, dotted ahead. */
export function Rail({ done, vertical, flex = 1 }: { done: boolean; vertical?: boolean; flex?: number }) {
    const line = { borderColor: done ? '$success' : '$textMuted', borderStyle: done ? ('solid' as const) : ('dotted' as const) };
    return vertical ? (
        <YStack flex={flex} width={0} borderLeftWidth={2} marginVertical={4} {...line} />
    ) : (
        <YStack flex={flex} height={0} borderTopWidth={2} {...line} />
    );
}

/** An order's letter on its colour — the same mark wherever that order appears. */
export function OrderAvatar({ mark, size = 40 }: { mark?: OrderMark; size?: number }) {
    return (
        <YStack width={size} height={size} borderRadius={Math.round(size * 0.3)} alignItems="center" justifyContent="center" backgroundColor={mark ? mark.tone : '$surfaceRaised'}>
            {mark ? (
                <Body fontSize={Math.round(size * 0.4)} fontWeight="800" color="#FFFFFF">
                    {mark.letter}
                </Body>
            ) : (
                <Glyph name="box" size={Math.round(size * 0.5)} />
            )}
        </YStack>
    );
}

/** Initials on a circle, for a person or a company. */
export function Initials({ name, size = 44, square }: { name?: string | null; size?: number; square?: boolean }) {
    const initials = String(name ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');
    return (
        <YStack width={size} height={size} borderRadius={square ? 14 : size / 2} alignItems="center" justifyContent="center" backgroundColor="$primaryFill" borderWidth={1} borderColor="$primaryBorder">
            <Body fontSize={Math.round(size * 0.34)} fontWeight="800" tone="brand">
                {initials || '·'}
            </Body>
        </YStack>
    );
}

/** One bar per step: green behind, blue for now, hairline ahead. */
export function SegmentBar({ total, done, currentIndex = -1, testID }: { total: number; done: number; currentIndex?: number; testID?: string }) {
    if (total <= 0) return null;
    // Past a couple of dozen the segments are slivers; a plain proportion reads better.
    if (total > 24) {
        return (
            <XStack flex={1} height={6} borderRadius={3} backgroundColor="$border" overflow="hidden" testID={testID}>
                <YStack flex={done} backgroundColor="$success" />
                <YStack flex={Math.max(total - done, 0)} />
            </XStack>
        );
    }
    return (
        <XStack flex={1} gap={4} testID={testID} accessibilityElementsHidden importantForAccessibility="no">
            {Array.from({ length: total }, (_, index) => (
                <YStack key={index} flex={1} height={6} borderRadius={3} backgroundColor={index === currentIndex ? '$primary' : index < done ? '$success' : '$border'} />
            ))}
        </XStack>
    );
}

/* -- Motion. ----------------------------------------------------------------- */

function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        let alive = true;
        AccessibilityInfo.isReduceMotionEnabled?.()
            .then((value) => alive && setReduced(Boolean(value)))
            .catch(() => undefined);
        const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => setReduced(Boolean(value)));
        return () => {
            alive = false;
            subscription?.remove?.();
        };
    }, []);
    return reduced;
}

/**
 * Rows arrive one after another, so the eye is led down the sequence. Only the
 * first handful stagger — the rest are below the fold — and nothing moves for
 * a driver who has asked the system for less motion.
 */
export function Rise({ index = 0, children }: { index?: number; children: React.ReactNode }) {
    const reduced = useReducedMotion();
    const progress = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const animation = Animated.timing(progress, { toValue: 1, duration: 320, delay: Math.min(index, 8) * 50, useNativeDriver: true });
        animation.start();
        return () => animation.stop();
        // Runs once per row: a re-render must not replay the entrance.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // The wrapper stays either way, so turning the setting on never remounts a row.
    return (
        <Animated.View style={reduced ? undefined : { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
            {children}
        </Animated.View>
    );
}
