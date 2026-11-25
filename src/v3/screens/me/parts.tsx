/**
 * The pieces every screen under Me is built from — design round 3.
 *
 * One card (radius 18, padding 14), one section label, one menu row, one
 * anchored primary action. They live here rather than in `ui/` because the
 * round 3 look arrived screen by screen; once Home and Jobs settle on the same
 * shapes these can move up.
 */
import React from 'react';
import { Image, KeyboardAvoidingView, Platform, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { XStack, YStack, useTheme, type XStackProps, type YStackProps } from 'tamagui';
import { ScrollView } from '../../ui/Scroll';
import { Body, Caption, Secondary } from '../../ui/Text';
import { space } from '../../theme/tokens';
import { isRTL } from '../../i18n/direction';
import { useScreenStyle } from '../../ui/useScreenStyle';
import { CARD_RADIUS } from '../../onboarding/AuthScaffold';

export { CARD_RADIUS };
/** The card padding of round 3. */
export const CARD_PAD = 14;

/* -- Icons ----------------------------------------------------------------- */

/** Stroke paths lifted from the round 3 mockups (24×24 viewBox). */
export const ICONS = {
    vehicle: 'M2.5 16V7.5A1.5 1.5 0 0 1 4 6h9v10M13 9h4.5l4 4v3h-2M9 17h6.5M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    fuel: 'M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M14 10h2.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V8.5L18 6M7.5 8h4',
    issue: 'M12 4l9 16H3zM12 10v5M12 17.5v.5',
    sync: 'M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4',
    pin: 'M12 21s7-6 7-11.5a7 7 0 0 0-14 0C5 15 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM9 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 16.5v.5',
    check: 'M9 4h6l1 3h3v13H5V7h3zM9 13l2 2 4-4',
    wallet: 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 7V6a2 2 0 0 1 2-2h10M16 13.5h.01',
    shield: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.500-7-10V6zM9 12l2 2 4-4',
    box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
    road: 'M8 3L5 21M16 3l3 18M12 5v3M12 11v3M12 17v3',
    camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    plus: 'M12 5v14M5 12h14',
    tick: 'M5 12.5l4.500 4.500L19 7.500',
    chevron: 'M9 5l7 7-7 7',
    chevronDown: 'M6 9l6 6 6-6',
    search: 'M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM16 16l4 4',
    person: 'M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c1-3.5 3.7-5 7-5s6 1.5 7 5',
    lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z',
    trailer: 'M3 7h13v9H3zM16 13h5M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
} as const;

export type IconName = keyof typeof ICONS;

/** A theme colour by token name, for SVG strokes that cannot take `$tokens`. */
export function useColor(token: string): string {
    const theme = useTheme();
    return (theme[token as keyof typeof theme] as { val?: string } | undefined)?.val ?? '#888888';
}

export function Icon({ name, size = 22, color = 'textSecondary', strokeWidth = 2.2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
    const stroke = useColor(color);
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
            <Path d={ICONS[name]} />
        </Svg>
    );
}

/** The trailing "goes somewhere" mark; flips for right-to-left. */
export function Chevron({ color = 'textMuted' }: { color?: string }) {
    return (
        <YStack style={isRTL() ? { transform: [{ scaleX: -1 }] } : undefined}>
            <Icon name="chevron" size={16} color={color} strokeWidth={2.4} />
        </YStack>
    );
}

/* -- Structure ------------------------------------------------------------- */

/** 12/800, tracked, upper case, muted: the label above a group. */
export function SectionLabel({ children, testID }: { children: string; testID?: string }) {
    return (
        <Caption fontSize={12} fontWeight="800" letterSpacing={0.7} color="$textMuted" testID={testID}>
            {children.toUpperCase()}
        </Caption>
    );
}

export function Section({ title, children, testID }: { title?: string; children: React.ReactNode; testID?: string }) {
    return (
        <YStack gap={10} testID={testID}>
            {title ? <SectionLabel>{title}</SectionLabel> : null}
            {children}
        </YStack>
    );
}

/** The round 3 card. `flush` drops the padding for cards made of rows. */
export function Card({ flush, selected, tone, children, ...rest }: YStackProps & { flush?: boolean; selected?: boolean; tone?: 'danger' | 'success' | 'warning' }) {
    const tinted = tone ? { backgroundColor: `$${tone}Fill`, borderColor: `$${tone}Border` } : {};
    return (
        <YStack
            backgroundColor={selected ? '$primaryFill' : '$surface'}
            borderWidth={selected ? 1.5 : 1}
            borderColor={selected ? '$primary' : '$border'}
            borderRadius={CARD_RADIUS}
            padding={flush ? 0 : CARD_PAD}
            overflow="hidden"
            {...(tinted as object)}
            {...rest}
        >
            {children}
        </YStack>
    );
}

/** A quieter inset tile, for figures inside or beside a card. */
export function Tile({ children, tone, ...rest }: YStackProps & { tone?: 'danger' }) {
    return (
        <YStack
            flex={1}
            gap={2}
            padding={space[3]}
            borderRadius={14}
            backgroundColor={tone === 'danger' ? '$dangerFill' : '$surfaceRaised'}
            borderWidth={tone === 'danger' ? 1 : 0}
            borderColor="$dangerBorder"
            {...rest}
        >
            {children}
        </YStack>
    );
}

/** A figure with its caption underneath: "84,212 km / on the clock". */
export function Stat({ value, label, mono, tone, testID }: { value: string; label: string; mono?: boolean; tone?: 'danger' | 'warning'; testID?: string }) {
    return (
        <Tile tone={tone === 'danger' ? 'danger' : undefined} testID={testID}>
            <Body fontSize={18} lineHeight={22} fontWeight={mono ? '600' : '800'} tabular numberOfLines={1} adjustsFontSizeToFit fontFamily={mono ? '$mono' : '$body'} tone={tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'primary'}>
                {value}
            </Body>
            <Secondary fontSize={12} lineHeight={16} numberOfLines={1}>
                {label}
            </Secondary>
        </Tile>
    );
}

/** A hairline between rows of a flush card. */
export function Rule() {
    return <YStack height={1} backgroundColor="$border" />;
}

/**
 * One row of a menu card: icon, label, a quiet value, and a chevron when it
 * goes somewhere. 54 high, which is the mockup's row and clears the 48 minimum.
 */
export function MenuRow({
    icon,
    label,
    value,
    valueTone,
    onPress,
    first,
    height = 54,
    testID,
}: {
    icon?: IconName;
    label: string;
    value?: string;
    valueTone?: 'warning' | 'danger' | 'success';
    onPress?: () => void;
    first?: boolean;
    height?: number;
    testID?: string;
}) {
    return (
        <XStack
            minHeight={height}
            alignItems="center"
            gap={space[3]}
            paddingHorizontal={CARD_PAD}
            borderTopWidth={first ? 0 : 1}
            borderTopColor="$border"
            onPress={onPress}
            pressStyle={onPress ? { backgroundColor: '$surfaceRaised' } : undefined}
            accessibilityRole={onPress ? 'button' : 'text'}
            accessibilityLabel={value ? `${label}, ${value}` : label}
            testID={testID}
        >
            {icon ? <Icon name={icon} /> : null}
            <Body flex={1} fontSize={16} fontWeight="700" numberOfLines={1}>
                {label}
            </Body>
            {value ? (
                <Body fontSize={14} fontWeight={valueTone ? '800' : '600'} tone={valueTone ?? 'secondary'} tabular numberOfLines={1} flexShrink={1}>
                    {value}
                </Body>
            ) : null}
            {onPress ? <Chevron /> : null}
        </XStack>
    );
}

/** Label on the left, value on the right; identifiers in mono and never cut. */
export function FactRow({ label, value, mono, first, testID }: { label: string; value: string; mono?: boolean; first?: boolean; testID?: string }) {
    return (
        <XStack minHeight={52} alignItems="center" gap={space[3]} paddingHorizontal={CARD_PAD} paddingVertical={space[2]} borderTopWidth={first ? 0 : 1} borderTopColor="$border" testID={testID}>
            <Secondary fontSize={14} flexShrink={0}>
                {label}
            </Secondary>
            <Body flex={1} fontSize={15} fontWeight={mono ? '600' : '700'} textAlign={isRTL() ? 'left' : 'right'} fontFamily={mono ? '$mono' : '$body'} tabular selectable={mono}>
                {value}
            </Body>
        </XStack>
    );
}

/* -- Small controls -------------------------------------------------------- */

/** A filter pill: filled when chosen. */
export function Chip({ label, selected, onPress, testID }: { label: string; selected?: boolean; onPress?: () => void; testID?: string }) {
    return (
        <XStack
            height={36}
            paddingHorizontal={14}
            alignItems="center"
            borderRadius={18}
            borderWidth={1}
            borderColor={selected ? '$textPrimary' : '$border'}
            backgroundColor={selected ? '$textPrimary' : '$transparent'}
            onPress={onPress}
            pressStyle={{ opacity: 0.7 }}
            // 36 high by design; the slop brings the target to 44.
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="button"
            accessibilityState={{ selected: !!selected }}
            testID={testID}
        >
            <Body fontSize={14} fontWeight="700" color={selected ? '$background' : '$textSecondary'} tabular numberOfLines={1}>
                {label}
            </Body>
        </XStack>
    );
}

/** A quiet label pill inside a card: a status, what it is about. */
export function Tag({ children, testID }: { children: string; testID?: string }) {
    return (
        <XStack height={28} paddingHorizontal={10} alignItems="center" borderRadius={14} backgroundColor="$surfaceRaised" flexShrink={1} testID={testID}>
            <Body fontSize={12} fontWeight="800" tone="secondary" numberOfLines={1}>
                {children}
            </Body>
        </XStack>
    );
}

/** The round "this one" mark at the end of a choice row. */
export function RadioMark({ selected, size = 26 }: { selected?: boolean; size?: number }) {
    return (
        <YStack
            width={size}
            height={size}
            borderRadius={size / 2}
            alignItems="center"
            justifyContent="center"
            backgroundColor={selected ? '$primary' : '$transparent'}
            borderWidth={selected ? 0 : 1.5}
            borderColor="$textMuted"
        >
            {selected ? <Icon name="tick" size={14} color="onPrimary" strokeWidth={3.4} /> : null}
        </YStack>
    );
}

/** A number plate: mono, in full, on the yellow a plate is. */
export function Plate({ value, size = 'md', testID }: { value?: string | null; size?: 'md' | 'lg'; testID?: string }) {
    if (!value) return null;
    return (
        /*
         * The one hard-coded colour pair in the area: a plate is yellow with
         * black characters in every theme, like the object it stands for.
         */
        <XStack alignSelf="flex-start" paddingHorizontal={size === 'lg' ? 10 : 8} paddingVertical={size === 'lg' ? 6 : 2} borderRadius={size === 'lg' ? 8 : 6} backgroundColor="#F5D447" testID={testID}>
            <Body fontFamily="$mono" fontSize={size === 'lg' ? 17 : 13} fontWeight="600" color="#1A1500" selectable accessibilityLabel={value}>
                {value}
            </Body>
        </XStack>
    );
}

/** Up to two initials, for a person or an organisation with no picture. */
export function initialsOf(name?: string | null): string {
    const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    const first = words[0].charAt(0);
    const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
}

/** A picture, or initials on the brand colour. `square` is for organisations. */
export function Avatar({ url, name, size = 68, square, testID }: { url?: string | null; name?: string | null; size?: number; square?: boolean; testID?: string }) {
    const radius = square ? Math.round(size * 0.3) : size / 2;
    if (url) {
        return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: radius }} accessibilityIgnoresInvertColors testID={testID} />;
    }
    return (
        <YStack width={size} height={size} borderRadius={radius} backgroundColor="$primary" alignItems="center" justifyContent="center" testID={testID}>
            <Body fontSize={Math.round(size * 0.36)} fontWeight="800" color="$onPrimary">
                {initialsOf(name)}
            </Body>
        </YStack>
    );
}

/** A small bordered button inside a card: "Edit", "Switch", "Fix". */
export function SmallButton({ label, onPress, tone, testID, ...rest }: { label: string; onPress?: () => void; tone?: 'danger'; testID?: string } & XStackProps) {
    return (
        <XStack
            height={44}
            paddingHorizontal={14}
            alignItems="center"
            justifyContent="center"
            borderRadius={14}
            borderWidth={1}
            borderColor={tone === 'danger' ? '$dangerBorder' : '$border'}
            backgroundColor={tone === 'danger' ? '$transparent' : '$surface'}
            onPress={onPress}
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityLabel={label}
            testID={testID}
            {...rest}
        >
            <Body fontSize={14} fontWeight="800" tone={tone === 'danger' ? 'danger' : 'primary'} numberOfLines={1}>
                {label}
            </Body>
        </XStack>
    );
}

/* -- Screen frames --------------------------------------------------------- */

/**
 * The bottom of a pushed screen: where its one primary action lives. The tab
 * bar is hidden on pushed screens, so this owns the home-indicator inset.
 */
export function BottomBar({ children, testID }: { children: React.ReactNode; testID?: string }) {
    const insets = useSafeAreaInsets();
    return (
        <YStack paddingHorizontal={space[4]} paddingTop={space[3]} paddingBottom={Math.max(insets.bottom, space[4]) + space[2]} gap={space[2]} backgroundColor="$background" testID={testID}>
            {children}
        </YStack>
    );
}

/**
 * A pushed screen: content that scrolls only when it has to, and the action
 * anchored under it, above the keyboard.
 */
export function Screen({
    children,
    footer,
    gap = space[4],
    refreshControl,
    testID,
}: {
    children: React.ReactNode;
    footer?: React.ReactNode;
    gap?: number;
    refreshControl?: ScrollViewProps['refreshControl'];
    testID?: string;
}) {
    const screen = useScreenStyle();
    const insets = useSafeAreaInsets();
    return (
        <KeyboardAvoidingView style={screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[1], paddingBottom: footer ? space[2] : Math.max(insets.bottom, space[4]) + space[2], gap, flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={refreshControl}
                testID={testID}
            >
                {children}
            </ScrollView>
            {footer ? <BottomBar>{footer}</BottomBar> : null}
        </KeyboardAvoidingView>
    );
}
