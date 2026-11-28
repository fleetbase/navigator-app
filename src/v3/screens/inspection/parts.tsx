/**
 * The pieces the inspection screens share — design round 3, s37 to s41.
 *
 * Drawn the way the mockups draw them (InspectStart, InspectList,
 * InspectDefect, InspectSign, InspectResult) and coloured from the theme's
 * tokens, so the same screens work in every scheme: the mockups' #111927 card
 * is `$surface`, their #17212F tile `$surfaceRaised`, their #223046 hairline
 * `$border`, and the green, amber and red are the feedback families.
 *
 * Nothing here knows what a form or a draft is: the screens decide, and hand
 * these the words to show.
 */
import { forwardRef, useState, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Spinner, XStack, YStack, useTheme } from 'tamagui';
import { Body } from '../../ui/Text';
import { fontFaces } from '../../theme/fonts';
import { UNCATEGORISED, type InspectionFieldGroup, type Severity } from '../../data';

export const GUTTER = 16;

type T = (key: string, options?: Record<string, unknown>) => string;

/** A part's name: the group's, or a plain word for checks the form did not group. */
export const partName = (group: Pick<InspectionFieldGroup, 'name'>, t: T) => (group.name === UNCATEGORISED ? t('inspection.begin.generalPart') : group.name);

/** A reading as typed: spaces and separators the driver used to group the digits are not part of it. */
export const cleanReading = (text: string) => text.replace(/[\s,'’]/g, '');

/* -- Icons: the mockups' own paths. ------------------------------------------- */

type Shape = { d: string } | { circle: [number, number, number] } | { rect: [number, number, number, number, number] };

export type InspectIconName = 'close' | 'back' | 'chevron' | 'check' | 'alert' | 'truck' | 'photo' | 'camera' | 'info' | 'noSignal' | 'clock' | 'pen' | 'file';

const ICONS: Record<InspectIconName, Shape[]> = {
    close: [{ d: 'M6 6l12 12M18 6L6 18' }],
    back: [{ d: 'M15 5l-7 7 7 7' }],
    chevron: [{ d: 'M9 5l7 7-7 7' }],
    check: [{ d: 'M5 12.5l4.5 4.5L19 7.5' }],
    alert: [{ d: 'M12 5v9M12 18.5v.5' }],
    truck: [{ d: 'M2.5 16V7.5A1.5 1.5 0 0 1 4 6h9v10M13 9h4.5l4 4v3h-2' }, { circle: [7, 17, 2] }, { circle: [17.5, 17, 2] }, { d: 'M9 17h6.5' }],
    photo: [{ rect: [3, 5, 18, 14, 3] }, { d: 'M4 17l5-4 4 3 3-2 4 3' }],
    camera: [{ d: 'M4 8h3l2-3h6l2 3h3v11H4z' }, { circle: [12, 13, 3.5] }],
    info: [{ circle: [12, 12, 9] }, { d: 'M12 8v5M12 16v.5' }],
    noSignal: [{ d: 'M4 4l16 16M3 9.5a13 13 0 0 1 4-2.7M10.5 5.6A13 13 0 0 1 21 9.5M6.5 13.5a8 8 0 0 1 3.3-2M17.5 13.5a8 8 0 0 0-2-1.5M12 18.5v.5' }],
    clock: [{ circle: [12, 12, 9] }, { d: 'M12 7v5l3 2' }],
    pen: [{ d: 'M4 20l4-1L19 8l-3-3L5 16z' }],
    file: [{ d: 'M7 3h7l5 5v13H7zM14 3v5h5' }],
};

export function InspectIcon({ name, size = 20, color, strokeWidth = 2.2 }: { name: InspectIconName; size?: number; color: string; strokeWidth?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no">
            {ICONS[name].map((shape, i) =>
                'd' in shape ? (
                    <Path key={i} d={shape.d} />
                ) : 'circle' in shape ? (
                    <Circle key={i} cx={shape.circle[0]} cy={shape.circle[1]} r={shape.circle[2]} />
                ) : (
                    <Rect key={i} x={shape.rect[0]} y={shape.rect[1]} width={shape.rect[2]} height={shape.rect[3]} rx={shape.rect[4]} />
                )
            )}
        </Svg>
    );
}

/** A theme colour by token name, for the SVG icons (which take a plain colour). */
export function useInk() {
    const theme = useTheme();
    return (token: string): string => ((theme as unknown as Record<string, { val?: string } | undefined>)[token]?.val ?? '#888888') as string;
}

/* -- The top of a screen. ------------------------------------------------------- */

/** The 44-square way back (or out): rounded 14, on the card surface. */
export function HeaderButton({ icon, label, onPress, testID }: { icon: 'close' | 'back'; label: string; onPress?: () => void; testID?: string }) {
    const ink = useInk();
    return (
        <YStack
            width={44}
            height={44}
            borderRadius={14}
            flexShrink={0}
            alignItems="center"
            justifyContent="center"
            backgroundColor="$surface"
            borderWidth={1}
            borderColor="$border"
            onPress={onPress}
            pressStyle={{ opacity: 0.6 }}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={label}
            testID={testID}
        >
            <InspectIcon name={icon} size={20} strokeWidth={2.4} color={ink('textPrimary')} />
        </YStack>
    );
}

/**
 * The header row: the way back, then an eyebrow over a title (the checklist
 * and the defect), a title alone (review), or a quiet line alone (start).
 */
export function ScreenTop({
    icon = 'back',
    backLabel,
    onBack,
    eyebrow,
    eyebrowTone = 'brand',
    title,
    titleSize = 20,
    quiet,
    aside,
    divided,
    children,
    testID,
}: {
    icon?: 'close' | 'back';
    backLabel: string;
    onBack?: () => void;
    eyebrow?: string;
    eyebrowTone?: 'brand' | 'danger';
    title?: string;
    titleSize?: number;
    /** A 14/700 secondary line in place of a title (the start screen's). */
    quiet?: string;
    aside?: ReactNode;
    /** A hairline under the header, as the checklist has. */
    divided?: boolean;
    /** Drawn under the row, inside the header (the checklist's part bar). */
    children?: ReactNode;
    testID?: string;
}) {
    return (
        <YStack paddingHorizontal={GUTTER} paddingTop={8} paddingBottom={divided ? 14 : 12} gap={14} borderBottomWidth={divided ? 1 : 0} borderColor="$border" testID={testID}>
            <XStack alignItems="center" gap={12}>
                {onBack ? <HeaderButton icon={icon} label={backLabel} onPress={onBack} testID="inspection-back" /> : null}
                <YStack flex={1} minWidth={0} gap={1}>
                    {eyebrow ? (
                        <Body fontSize={12} lineHeight={16} fontWeight="800" letterSpacing={0.72} textTransform="uppercase" tone={eyebrowTone} numberOfLines={1}>
                            {eyebrow}
                        </Body>
                    ) : null}
                    {title ? (
                        <Body fontSize={titleSize} lineHeight={titleSize + 5} fontWeight="800" accessibilityRole="header" numberOfLines={2}>
                            {title}
                        </Body>
                    ) : null}
                    {quiet ? (
                        <Body fontSize={14} lineHeight={19} fontWeight="700" tone="secondary" numberOfLines={1}>
                            {quiet}
                        </Body>
                    ) : null}
                </YStack>
                {aside}
            </XStack>
            {children}
        </YStack>
    );
}

/** The 30-high pill at the header's right: "Saved on phone", or that there is no signal. */
export function SavedPill({ label, offline, testID }: { label: string; offline?: boolean; testID?: string }) {
    const ink = useInk();
    return (
        <XStack alignItems="center" gap={6} height={30} paddingHorizontal={10} borderRadius={15} flexShrink={0} backgroundColor="$surfaceRaised" accessible accessibilityLabel={label} testID={testID}>
            <InspectIcon name={offline ? 'noSignal' : 'check'} size={13} strokeWidth={offline ? 2.4 : 3.2} color={ink(offline ? 'textSecondary' : 'successText')} />
            <Body fontSize={12} lineHeight={16} fontWeight="800" tone="secondary" numberOfLines={1}>
                {label}
            </Body>
        </XStack>
    );
}

/* -- The foot of a screen. ------------------------------------------------------ */

/** Where the one action sits: 12 above it, clear of the home indicator below. */
export function FootBar({ children, divided, row, testID }: { children: ReactNode; divided?: boolean; /** Side by side, as the checklist's count and button are. */ row?: boolean; testID?: string }) {
    const insets = useSafeAreaInsets();
    const Stack = row ? XStack : YStack;
    return (
        <Stack
            paddingHorizontal={GUTTER}
            paddingTop={12}
            paddingBottom={Math.max(insets.bottom - 6, 16)}
            gap={row ? 12 : 8}
            alignItems={row ? 'center' : undefined}
            borderTopWidth={divided ? 1 : 0}
            borderColor="$border"
            backgroundColor="$background"
            testID={testID}
        >
            {children}
        </Stack>
    );
}

/**
 * The 60-high button. `off` is the mockups' switched-off state: it says why it
 * cannot be pressed yet ("Answer each check to go on") on the raised tile.
 */
export function FootButton({ label, kind = 'primary', onPress, loading, testID, flex }: { label: string; kind?: 'primary' | 'secondary' | 'off'; onPress?: () => void; loading?: boolean; testID?: string; flex?: number }) {
    const ink = useInk();
    const inert = kind === 'off' || !!loading;
    const color = kind === 'primary' ? ink('onPrimary') : kind === 'off' ? ink('textSecondary') : ink('textPrimary');
    return (
        <XStack
            flex={flex}
            alignItems="center"
            justifyContent="center"
            height={60}
            paddingHorizontal={16}
            borderRadius={16}
            backgroundColor={kind === 'primary' ? '$primary' : kind === 'off' ? '$surfaceRaised' : '$surface'}
            borderWidth={kind === 'secondary' ? 1 : 0}
            borderColor="$border"
            onPress={inert ? undefined : onPress}
            pressStyle={inert ? undefined : { opacity: 0.85 }}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: inert, busy: !!loading }}
            testID={testID}
        >
            {loading ? (
                <Spinner size="small" color={color} />
            ) : (
                <Body fontSize={kind === 'secondary' ? 16 : kind === 'off' ? 17 : 18} lineHeight={23} fontWeight={kind === 'secondary' ? '700' : '800'} color={color} numberOfLines={1}>
                    {label}
                </Body>
            )}
        </XStack>
    );
}

/* -- Cards, labels, rows. --------------------------------------------------------- */

/** Radius 18, the card surface and its hairline. `tone` is a coloured hairline (a defect's amber). */
export function Panel({ children, padding = 14, tone, onPress, label, testID, ...rest }: { children: ReactNode; padding?: number; tone?: 'warning' | 'danger' | 'brand'; onPress?: () => void; label?: string; testID?: string } & Record<string, unknown>) {
    return (
        <YStack
            borderRadius={18}
            backgroundColor="$surface"
            borderWidth={tone === 'brand' ? 1.5 : 1}
            borderColor={tone === 'warning' ? '$warningBorder' : tone === 'danger' ? '$dangerBorder' : tone === 'brand' ? '$primary' : '$border'}
            padding={padding}
            onPress={onPress}
            pressStyle={onPress ? { opacity: 0.75 } : undefined}
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={label}
            testID={testID}
            {...rest}
        >
            {children}
        </YStack>
    );
}

/** 13/700 secondary: the label over a field or a group ("Odometer now", "How bad is it?"). */
export function FieldLabel({ children, aside }: { children: string; aside?: ReactNode }) {
    return (
        <XStack alignItems="baseline" justifyContent="space-between" gap={12}>
            <Body flexShrink={1} fontSize={13} lineHeight={17} fontWeight="700" tone="secondary">
                {children}
            </Body>
            {aside}
        </XStack>
    );
}

/** 12/800 tracked: "WHAT HAPPENS NOW". */
export function Eyebrow({ children, tone = 'secondary' }: { children: string; tone?: 'secondary' | 'brand' | 'danger' | 'success' | 'warning' }) {
    return (
        <Body fontSize={12} lineHeight={16} fontWeight="800" letterSpacing={0.72} textTransform="uppercase" tone={tone}>
            {children}
        </Body>
    );
}

/** A label and a value across a card, 46 high, with a hairline above all but the first. */
export function FactRow({ label, children, first, testID }: { label: string; children: ReactNode; first?: boolean; testID?: string }) {
    return (
        <XStack alignItems="center" justifyContent="space-between" gap={12} minHeight={46} paddingVertical={6} borderTopWidth={first ? 0 : 1} borderColor="$border" testID={testID}>
            <Body flexShrink={0} fontSize={15} lineHeight={20} tone="secondary">
                {label}
            </Body>
            <XStack flexShrink={1} justifyContent="flex-end">
                {children}
            </XStack>
        </XStack>
    );
}

/* -- How bad a problem is: three levels over the four severities. -------------- */

/**
 * The mockup's three levels. A driver says how bad it is in words that mean
 * something at the roadside; the data keeps its four severities, so a level is
 * a severity (and, for unsafe, the driver's own unsafe mark).
 */
export type Level = 'minor' | 'repair' | 'unsafe';
export const LEVELS: Level[] = ['minor', 'repair', 'unsafe'];

export function levelOf(answer?: { severity?: Severity | string | null; unsafe?: boolean } | null): Level {
    if (answer?.unsafe) return 'unsafe';
    const s = String(answer?.severity ?? 'medium');
    if (s === 'low') return 'minor';
    if (s === 'high' || s === 'critical') return 'unsafe';
    return 'repair';
}

/** The severity a level is filed as. Unsafe keeps a critical the field already asked for. */
export function severityFor(level: Level, current?: Severity): Severity {
    if (level === 'minor') return 'low';
    if (level === 'repair') return 'medium';
    return current === 'critical' ? 'critical' : 'high';
}

const LEVEL_LOOK: Record<Level, { fill: string; radius: number; glyph: string; border: string }> = {
    minor: { fill: '$info', radius: 18, glyph: 'i', border: '$info' },
    repair: { fill: '$warning', radius: 10, glyph: '!', border: '$warning' },
    unsafe: { fill: '$danger', radius: 4, glyph: '×', border: '$danger' },
};

export const levelBorder = (level: Level) => LEVEL_LOOK[level].border;

/** A level's mark: its colour, its own shape (round, rounded, square) and its own glyph, never colour alone. */
export function LevelMark({ level, size = 36 }: { level: Level; size?: number }) {
    const look = LEVEL_LOOK[level];
    return (
        <YStack width={size} height={size} borderRadius={Math.min(look.radius, size / 2)} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor={look.fill as never}>
            <Body fontSize={size >= 36 ? 16 : 13} lineHeight={size >= 36 ? 20 : 16} fontWeight="800" color="$background">
                {look.glyph}
            </Body>
        </YStack>
    );
}

/* -- Typing. ---------------------------------------------------------------------- */

/**
 * A text box drawn the mockups' way. As with ui/Field, nothing above the input
 * changes while it is focused: the focus ring is a sibling laid over the frame,
 * so focusing never re-renders an ancestor (which would drop the keyboard).
 */
export const InlineInput = forwardRef<TextInput, TextInputProps & { mono?: boolean; height?: number; fontSize?: number; accessory?: ReactNode; trailing?: ReactNode; invalid?: boolean; frameTestID?: string }>(function InlineInput(
    { mono, height, fontSize = 16, accessory, trailing, invalid, multiline, frameTestID, style, onFocus, onBlur, ...input },
    ref
) {
    const ink = useInk();
    const [focused, setFocused] = useState(false);
    const ring = invalid ? ink('danger') : focused ? ink('primary') : 'transparent';
    return (
        <View testID={frameTestID}>
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: multiline ? 'flex-end' : 'center',
                    gap: 8,
                    height: multiline ? undefined : (height ?? 60),
                    minHeight: multiline ? 96 : undefined,
                    paddingHorizontal: multiline ? 12 : 16,
                    paddingVertical: multiline ? 12 : 0,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: ink('border'),
                    backgroundColor: ink('surface'),
                }}
            >
                <TextInput
                    ref={ref}
                    multiline={multiline}
                    placeholderTextColor={ink('textMuted')}
                    onFocus={(event) => {
                        setFocused(true);
                        onFocus?.(event);
                    }}
                    onBlur={(event) => {
                        setFocused(false);
                        onBlur?.(event);
                    }}
                    style={[
                        {
                            flex: 1,
                            minWidth: 0,
                            padding: 0,
                            color: ink('textPrimary'),
                            fontFamily: mono ? fontFaces.mono[600] : fontFaces.ui[500],
                            fontSize,
                            lineHeight: multiline ? 23 : undefined,
                            textAlignVertical: multiline ? 'top' : 'center',
                            minHeight: multiline ? 69 : undefined,
                        },
                        mono ? { fontVariant: ['tabular-nums'] } : null,
                        style,
                    ]}
                    {...input}
                />
                {accessory}
                {trailing}
            </View>
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 16, borderWidth: ring === 'transparent' ? 0 : 1.5, borderColor: ring }} />
        </View>
    );
});

/* -- What happens now (the result's steps). ---------------------------------------- */

/** One step: a green tick once done, an empty ring while it is still to come. */
export function StepRow({ title, body, at, done, waiting, testID }: { title: string; body?: string; at?: string; done: boolean; /** Kept on the phone, to be sent: a clock in the ring. */ waiting?: boolean; testID?: string }) {
    const ink = useInk();
    return (
        <XStack alignItems="flex-start" gap={12} testID={testID} accessible accessibilityLabel={[title, body, at].filter(Boolean).join('. ')}>
            <YStack
                width={28}
                height={28}
                borderRadius={14}
                flexShrink={0}
                alignItems="center"
                justifyContent="center"
                backgroundColor={done ? '$success' : 'transparent'}
                borderWidth={done ? 0 : 1.5}
                borderColor={waiting ? '$textSecondary' : '$textMuted'}
            >
                {done ? <InspectIcon name="check" size={14} strokeWidth={3.4} color={ink('background')} /> : waiting ? <InspectIcon name="clock" size={14} strokeWidth={2.6} color={ink('textSecondary')} /> : null}
            </YStack>
            <YStack flex={1} minWidth={0} gap={2}>
                <Body fontSize={16} lineHeight={21} fontWeight="800">
                    {title}
                </Body>
                {body ? (
                    <Body fontSize={14} lineHeight={20} tone="secondary">
                        {body}
                    </Body>
                ) : null}
            </YStack>
            {at ? (
                <Body flexShrink={0} fontSize={13} lineHeight={20} tabular tone="secondary">
                    {at}
                </Body>
            ) : null}
        </XStack>
    );
}

/** The quiet note on the raised tile, with an info mark. */
export function InfoNote({ children, tone, testID }: { children: string; tone?: 'warning' | 'danger'; testID?: string }) {
    const ink = useInk();
    return (
        <XStack alignItems="flex-start" gap={10} paddingVertical={12} paddingHorizontal={14} borderRadius={14} backgroundColor={tone === 'warning' ? '$warningFill' : tone === 'danger' ? '$dangerFill' : '$surfaceRaised'} testID={testID}>
            <View style={{ marginTop: 1 }}>
                <InspectIcon name="info" size={18} strokeWidth={2.2} color={ink(tone === 'warning' ? 'warningText' : tone === 'danger' ? 'dangerText' : 'textSecondary')} />
            </View>
            <Body flex={1} fontSize={14} lineHeight={20} tone={tone === 'warning' ? 'warning' : tone === 'danger' ? 'danger' : 'secondary'}>
                {children}
            </Body>
        </XStack>
    );
}

/** A status as colour, a square mark and a word: the repair job's "Open". */
export function StatusChip({ label, tone = 'brand', testID }: { label: string; tone?: 'brand' | 'success' | 'warning' | 'danger' | 'muted'; testID?: string }) {
    const dot = tone === 'brand' ? '$primary' : tone === 'success' ? '$success' : tone === 'warning' ? '$warning' : tone === 'danger' ? '$danger' : '$textMuted';
    return (
        <XStack alignItems="center" gap={6} height={30} paddingHorizontal={10} borderRadius={15} flexShrink={0} backgroundColor="$surfaceRaised" testID={testID}>
            <YStack width={8} height={8} borderRadius={2} backgroundColor={dot as never} />
            <Body fontSize={12} lineHeight={16} fontWeight="800" tone="secondary" numberOfLines={1}>
                {label}
            </Body>
        </XStack>
    );
}

/** A thin rule of the parts: one segment per part, its width the part's share of the checks. */
export function PartBar({ parts, current, onPick, label }: { parts: { size: number; answered: number; done: boolean; name: string }[]; current: number; onPick?: (index: number) => void; label: (index: number) => string }) {
    return (
        <XStack gap={4} accessibilityRole="tablist">
            {parts.map((part, i) => {
                const share = part.size > 0 ? part.answered / part.size : 0;
                return (
                    <YStack
                        key={i}
                        flex={Math.max(1, part.size)}
                        height={18}
                        justifyContent="center"
                        onPress={onPick ? () => onPick(i) : undefined}
                        accessibilityRole="tab"
                        accessibilityLabel={label(i)}
                        accessibilityState={{ selected: i === current }}
                    >
                        <YStack height={6} borderRadius={3} overflow="hidden" backgroundColor={part.done ? '$success' : '$border'}>
                            {!part.done && i === current && share > 0 ? <YStack width={`${Math.round(share * 100)}%`} height={6} backgroundColor="$primary" /> : null}
                            {!part.done && i !== current && share > 0 ? <YStack width={`${Math.round(share * 100)}%`} height={6} backgroundColor="$textMuted" /> : null}
                        </YStack>
                    </YStack>
                );
            })}
        </XStack>
    );
}
