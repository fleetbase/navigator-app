/**
 * The pieces of the proof-by-scanning screen (design round 3, "camera first").
 *
 * Two kinds of thing live here and they are coloured differently on purpose:
 *
 *   - what sits **over the live camera** (the round buttons, the progress pill,
 *     the confirmation and the messages) carries its own dark backing and the
 *     same colours in every scheme, because it is read against a picture of a
 *     van or a depot, in any light (`onCamera`, in ui/Scanner);
 *   - what is a **surface of the app** (the drawer and the sheet for typing a
 *     code) uses the theme's tokens and follows light and dark.
 *
 * Nothing here knows what a scan is worth or where it is sent: the screen
 * (ProofScan) decides, and hands these the words to show.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, Animated, Easing, Keyboard, Linking, Platform, View, type TextInput } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Spinner, XStack, YStack, useTheme } from 'tamagui';
import { Body, Secondary } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { SheetModal } from '../../ui/SheetModal';
import { onCamera } from '../../ui/Scanner';
import { useTranslation } from '../../i18n/useTranslation';

/* -- Icons: the mockups' own paths. ------------------------------------------- */

const PATHS = {
    check: 'M5 12.5l4.5 4.5L19 7.5',
    close: 'M6 6l12 12M18 6L6 18',
    torch: 'M8 3h8l-2 6v11h-4V9z',
    keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
    box: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
    chevronUp: 'M6 15l6-6 6 6',
    chevronDown: 'M6 9l6 6 6-6',
    doubleCheck: 'M2.5 12.5l4 4L15 8M11.5 15.5l1 1L21.5 8',
    noSignal: 'M4 4l16 16M3 9.5a13 13 0 0 1 4-2.7M10.5 5.6A13 13 0 0 1 21 9.5M6.5 13.5a8 8 0 0 1 3.3-2M17.5 13.5a8 8 0 0 0-2-1.5M12 18.5v.5',
    alert: 'M12 5v9M12 18.5v.5',
    retry: 'M4 12a8 8 0 1 0 3-6.2M4 4v5h5',
    cameraOff: 'M4 8h3l2-3h6l2 3h3v11H4zM3 3l18 18',
    // The signature screen's: a pen, a phone being turned on its side, a phone upright.
    pencil: 'M4 20l4-1L19 8l-3-3L5 16z',
    turn: 'M10 3h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3 15a9 9 0 0 0 6 6.5M9.5 18.5v3h-3',
    upright: 'M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM11 18h2',
} as const;

export type ProofIconName = keyof typeof PATHS;

export function ProofIcon({ name, size = 20, color, strokeWidth = 2.2 }: { name: ProofIconName; size?: number; color: string; strokeWidth?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no">
            <Path d={PATHS[name]} />
        </Svg>
    );
}

/* -- Motion. ------------------------------------------------------------------ */

/** Slides its content up into place, once, when it appears. Simply appears with reduced motion on. */
export function Rise({ children, from = 150 }: { children: ReactNode; from?: number }) {
    const progress = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        let cancelled = false;
        AccessibilityInfo.isReduceMotionEnabled()
            .catch(() => false)
            .then((reduced) => {
                if (cancelled) return;
                if (reduced) {
                    progress.setValue(1);
                    return;
                }
                Animated.timing(progress, { toValue: 1, duration: 320, easing: Easing.bezier(0.2, 0.9, 0.3, 1), useNativeDriver: true }).start();
            });
        return () => {
            cancelled = true;
        };
    }, [progress]);
    return <Animated.View style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }}>{children}</Animated.View>;
}

/** The tick's small bounce as the confirmation lands. Still with reduced motion on. */
function Pop({ children }: { children: ReactNode }) {
    const scale = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        let cancelled = false;
        AccessibilityInfo.isReduceMotionEnabled()
            .catch(() => false)
            .then((reduced) => {
                if (cancelled || reduced) return;
                scale.setValue(0.6);
                Animated.sequence([
                    Animated.delay(150),
                    Animated.timing(scale, { toValue: 1.12, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                    Animated.timing(scale, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                ]).start();
            });
        return () => {
            cancelled = true;
        };
    }, [scale]);
    return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

/* -- Over the camera: the top row. -------------------------------------------- */

/** A 48dp round control on the camera: close, the torch. `on` is a held-down state (the torch lit). */
export function GlassButton({ icon, label, onPress, on, testID }: { icon: ProofIconName; label: string; onPress?: () => void; on?: boolean; testID?: string }) {
    return (
        <YStack
            width={48}
            height={48}
            borderRadius={24}
            flexShrink={0}
            alignItems="center"
            justifyContent="center"
            backgroundColor={on ? onCamera.text : onCamera.glass}
            borderWidth={1}
            borderColor={on ? onCamera.text : onCamera.glassBorder}
            onPress={onPress}
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={on === undefined ? undefined : { selected: on }}
            testID={testID}
        >
            <ProofIcon name={icon} size={icon === 'close' ? 18 : 20} strokeWidth={icon === 'close' ? 2.6 : 2.2} color={on ? onCamera.ground : onCamera.text} />
        </YStack>
    );
}

/** How many segments the pill draws before the words alone say it: more would not fit between the two buttons. */
const PILL_SEGMENTS = 4;

/** "2 of 3 scanned", with a segment per item while there are few enough to draw. */
export function ProgressPill({ scanned, total, text, label, testID }: { scanned: number; total: number; text: string; label: string; testID?: string }) {
    const segments = total > 0 && total <= PILL_SEGMENTS;
    return (
        <XStack
            alignItems="center"
            gap={10}
            height={48}
            paddingHorizontal={16}
            borderRadius={24}
            flexShrink={1}
            backgroundColor={onCamera.glass}
            borderWidth={1}
            borderColor={onCamera.glassBorder}
            accessible
            accessibilityLabel={label}
            accessibilityLiveRegion="polite"
            testID={testID}
        >
            {segments ? (
                <XStack alignItems="center" gap={4}>
                    {Array.from({ length: total }, (_, index) => (
                        <YStack key={index} width={16} height={8} borderRadius={4} backgroundColor={index < scanned ? onCamera.success : 'transparent'} borderWidth={index < scanned ? 0 : 1.5} borderColor={onCamera.empty} />
                    ))}
                </XStack>
            ) : null}
            <Body fontSize={17} lineHeight={22} fontWeight="800" tabular color={onCamera.text} numberOfLines={1} flexShrink={1}>
                {text}
            </Body>
        </XStack>
    );
}

/** One line of instruction on its own dark backing. */
export function GlassLine({ children, testID }: { children: string; testID?: string }) {
    return (
        <XStack alignItems="center" minHeight={36} paddingHorizontal={14} paddingVertical={6} borderRadius={18} backgroundColor={onCamera.glass} borderWidth={1} borderColor={onCamera.glassBorder} testID={testID}>
            <Body fontSize={14} lineHeight={19} fontWeight="700" tabular color={onCamera.text} center>
                {children}
            </Body>
        </XStack>
    );
}

/** The way out for a damaged label, and the other choices of a camera that cannot be used. */
export function GlassAction({ icon, label, onPress, disabled, testID }: { icon?: ProofIconName; label: string; onPress?: () => void; disabled?: boolean; testID?: string }) {
    return (
        <XStack
            alignItems="center"
            justifyContent="center"
            gap={8}
            height={48}
            paddingHorizontal={18}
            borderRadius={24}
            backgroundColor={onCamera.glass}
            borderWidth={1}
            borderColor={onCamera.quietBorder}
            opacity={disabled ? 0.5 : 1}
            onPress={disabled ? undefined : onPress}
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!disabled }}
            testID={testID}
        >
            {icon ? <ProofIcon name={icon} size={18} color={onCamera.textSoft} /> : null}
            <Body fontSize={15} lineHeight={20} fontWeight="700" color={onCamera.textSoft} numberOfLines={1}>
                {label}
            </Body>
        </XStack>
    );
}

/* -- Over the camera: what a read came to. ------------------------------------- */

const CARD_SHADOW = { shadowColor: '#000000', shadowOpacity: 0.6, shadowRadius: 22, shadowOffset: { width: 0, height: 18 } } as const;
const MESSAGE_SHADOW = { shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 13, shadowOffset: { width: 0, height: 10 } } as const;

/**
 * The success moment: large, green, naming the item and its tracking number in full.
 * The signature screen uses it with a `note` (a plain line) in place of a code.
 */
export function ScannedCard({ caption, name, code, note, testID }: { caption: string; name?: string; code?: string; note?: string; testID?: string }) {
    return (
        <XStack
            alignItems="center"
            gap={14}
            paddingVertical={18}
            paddingHorizontal={16}
            borderRadius={22}
            backgroundColor={onCamera.successFill}
            borderWidth={1.5}
            borderColor={onCamera.successBorder}
            {...CARD_SHADOW}
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${caption}. ${[name, code, note].filter(Boolean).join(', ')}`}
            testID={testID}
        >
            <Pop>
                <YStack width={64} height={64} borderRadius={32} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor={onCamera.success}>
                    <ProofIcon name="check" size={32} strokeWidth={3.2} color={onCamera.onSuccess} />
                </YStack>
            </Pop>
            <YStack flex={1} minWidth={0}>
                <Body fontSize={12} lineHeight={16} fontWeight="800" letterSpacing={0.72} tabular color={onCamera.success} textTransform="uppercase">
                    {caption}
                </Body>
                {name ? (
                    <Body fontSize={24} lineHeight={30} fontWeight="800" letterSpacing={-0.24} color={onCamera.text}>
                        {name}
                    </Body>
                ) : null}
                {/* In full, never cut: it is compared with the number printed under the barcode. */}
                {code ? (
                    <Body fontFamily="$mono" fontSize={17} lineHeight={22} fontWeight="600" color={onCamera.text}>
                        {code}
                    </Body>
                ) : null}
                {note ? (
                    <Body fontSize={14} lineHeight={19} color={onCamera.successSoft}>
                        {note}
                    </Body>
                ) : null}
            </YStack>
        </XStack>
    );
}

/** What the confirmation settles into: one short line that stays while the next label is found. */
export function ScannedStrip({ title, aside, mono, testID }: { title: string; aside?: string; /** The title is a tracking number: mono, and in full. */ mono?: boolean; testID?: string }) {
    return (
        <XStack
            alignItems="center"
            gap={10}
            minHeight={52}
            paddingHorizontal={14}
            paddingVertical={6}
            borderRadius={16}
            backgroundColor={onCamera.successFill}
            borderWidth={1.5}
            borderColor={onCamera.successBorder}
            accessible
            accessibilityLabel={aside ? `${title}. ${aside}` : title}
            testID={testID}
        >
            <YStack width={28} height={28} borderRadius={14} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor={onCamera.success}>
                <ProofIcon name="check" size={16} strokeWidth={3.4} color={onCamera.onSuccess} />
            </YStack>
            {mono ? (
                <Body flex={1} minWidth={0} fontFamily="$mono" fontSize={15} lineHeight={20} fontWeight="600" color={onCamera.success}>
                    {title}
                </Body>
            ) : (
                <Body flex={1} minWidth={0} fontSize={17} lineHeight={22} fontWeight="800" tabular color={onCamera.success} numberOfLines={1}>
                    {title}
                </Body>
            )}
            {aside ? (
                <Body flexShrink={1} fontSize={14} lineHeight={19} fontWeight="700" tabular color={onCamera.successSoft} numberOfLines={1}>
                    {aside}
                </Body>
            ) : null}
        </XStack>
    );
}

export type MessageTone = 'danger' | 'warning' | 'calm';

const MESSAGE_LOOK: Record<MessageTone, { fill: string; border: string; borderWidth: number; iconFill: string; iconColor: string; title: string }> = {
    danger: { fill: onCamera.dangerFill, border: onCamera.dangerBorder, borderWidth: 1.5, iconFill: onCamera.danger, iconColor: onCamera.onDanger, title: onCamera.dangerText },
    warning: { fill: onCamera.warningFill, border: onCamera.warningBorder, borderWidth: 1.5, iconFill: onCamera.warning, iconColor: onCamera.onWarning, title: onCamera.warning },
    calm: { fill: onCamera.calmFill, border: onCamera.quietBorder, borderWidth: 1, iconFill: onCamera.calmIcon, iconColor: onCamera.textSoft, title: onCamera.text },
};

export interface MessageLine {
    text: string;
    /** `plain` is the quiet grey of a hint; `strong` is what the server said; `soft` introduces it. */
    look?: 'plain' | 'bright' | 'strong' | 'soft';
}

/**
 * A message where the confirmation sits: red for a code that is not wanted or a
 * send that failed, amber for an item scanned twice, grey for no signal. Each
 * has its own mark and its own words, so the colour is never the only sign.
 */
export function MessageCard({ tone, icon, title, code, lines, alert, testID }: { tone: MessageTone; icon: ProofIconName; title: string; code?: string; lines: MessageLine[]; alert?: boolean; testID?: string }) {
    const look = MESSAGE_LOOK[tone];
    const lineColor = (line: MessageLine) => (line.look === 'bright' || line.look === 'strong' ? onCamera.text : line.look === 'soft' ? onCamera.dangerSoft : onCamera.textSoft);
    return (
        <XStack
            alignItems="flex-start"
            gap={12}
            padding={14}
            borderRadius={18}
            backgroundColor={look.fill}
            borderWidth={look.borderWidth}
            borderColor={look.border}
            {...MESSAGE_SHADOW}
            accessible
            accessibilityRole={alert ? 'alert' : undefined}
            accessibilityLiveRegion={alert ? 'assertive' : 'polite'}
            accessibilityLabel={[title, code, ...lines.map((line) => line.text)].filter(Boolean).join('. ')}
            testID={testID}
        >
            <YStack width={44} height={44} borderRadius={22} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor={look.iconFill} borderWidth={tone === 'calm' ? 1 : 0} borderColor={onCamera.quietBorder}>
                <ProofIcon name={icon} size={22} strokeWidth={tone === 'calm' ? 2.2 : icon === 'doubleCheck' ? 2.8 : 3.2} color={look.iconColor} />
            </YStack>
            <YStack flex={1} minWidth={0}>
                <Body fontSize={19} lineHeight={24} fontWeight="800" letterSpacing={-0.19} color={look.title}>
                    {title}
                </Body>
                {/* The tracking number, in full: never an address, never cut. */}
                {code ? (
                    <Body fontFamily="$mono" fontSize={15} lineHeight={20} fontWeight="600" color={onCamera.text}>
                        {code}
                    </Body>
                ) : null}
                {lines.map((line, index) => (
                    <Body key={index} fontSize={14} lineHeight={19} fontWeight={line.look === 'strong' ? '700' : '400'} tabular color={lineColor(line)}>
                        {line.text}
                    </Body>
                ))}
            </YStack>
        </XStack>
    );
}

/** The one button of the camera view: 60 high, there only when it is the thing to do. */
export function PrimaryAction({ label, icon, onPress, loading, disabled, testID }: { label: string; icon?: ProofIconName; onPress?: () => void; loading?: boolean; disabled?: boolean; testID?: string }) {
    const theme = useTheme();
    const inert = !!loading || !!disabled;
    const ink = theme.onPrimary?.val as string;
    return (
        <XStack
            alignItems="center"
            justifyContent="center"
            gap={10}
            height={60}
            paddingHorizontal={16}
            borderRadius={16}
            backgroundColor="$primary"
            opacity={disabled ? 0.5 : 1}
            onPress={inert ? undefined : onPress}
            pressStyle={{ opacity: 0.85 }}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: inert, busy: !!loading }}
            testID={testID}
        >
            {loading ? (
                <Spinner size="small" color={ink} />
            ) : (
                <>
                    {icon ? <ProofIcon name={icon} size={20} strokeWidth={icon === 'check' ? 3 : 2.6} color={ink} /> : null}
                    <Body fontSize={18} lineHeight={23} fontWeight="800" tabular color={ink} numberOfLines={1}>
                        {label}
                    </Body>
                </>
            )}
        </XStack>
    );
}

/* -- Over the camera: a camera that cannot be used. ---------------------------- */

/**
 * Shown in place of the scan frame when the driver has not allowed the camera,
 * or the phone has none to give. It says what to do, and typing the code is
 * still open: a step that needs scans is never stuck behind a camera.
 */
export function CameraProblem({ denied, onType, testID }: { denied: boolean; onType: () => void; testID?: string }) {
    const { t } = useTranslation();
    return (
        <YStack alignItems="center" gap={14} paddingHorizontal={24} testID={testID}>
            <YStack width={64} height={64} borderRadius={32} alignItems="center" justifyContent="center" backgroundColor={onCamera.calmIcon} borderWidth={1} borderColor={onCamera.quietBorder}>
                <ProofIcon name="cameraOff" size={30} color={onCamera.textSoft} />
            </YStack>
            <YStack alignItems="center" gap={6}>
                <Body fontSize={19} lineHeight={24} fontWeight="800" letterSpacing={-0.19} color={onCamera.text} center>
                    {t(denied ? 'proof.scan.camera.deniedTitle' : 'proof.scan.camera.unavailableTitle')}
                </Body>
                <Body fontSize={14} lineHeight={19} color={onCamera.textSoft} center>
                    {t(denied ? 'proof.scan.camera.deniedBody' : 'proof.scan.camera.unavailableBody')}
                </Body>
            </YStack>
            <YStack alignSelf="stretch" gap={10} paddingTop={4}>
                {denied ? <GlassAction label={t('proof.scan.camera.openSettings')} onPress={() => void Linking.openSettings().catch(() => undefined)} testID="proof-camera-settings" /> : null}
                <GlassAction icon="keyboard" label={t('proof.scan.camera.typeCode')} onPress={onType} testID="proof-camera-type" />
            </YStack>
        </YStack>
    );
}

/**
 * Shown in place of the scan frame when the camera is allowed and in front and
 * still has not given a picture after a few seconds, or has reported an error.
 * It turns a black screen into something the driver can act on: start the
 * camera again, or type the code. `detail` is the camera's own reason when it
 * gave one, small, so it can be read out when the fault is reported.
 */
export function CameraSlow({ detail, onRetry, onType, testID }: { detail?: string; onRetry: () => void; onType: () => void; testID?: string }) {
    const { t } = useTranslation();
    return (
        <YStack alignItems="center" gap={14} paddingHorizontal={24} testID={testID}>
            <YStack width={64} height={64} borderRadius={32} alignItems="center" justifyContent="center" backgroundColor={onCamera.calmIcon} borderWidth={1} borderColor={onCamera.quietBorder}>
                <ProofIcon name="cameraOff" size={30} color={onCamera.textSoft} />
            </YStack>
            <YStack alignItems="center" gap={6} accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Body fontSize={19} lineHeight={24} fontWeight="800" letterSpacing={-0.19} color={onCamera.text} center>
                    {t('proof.scan.camera.slowTitle')}
                </Body>
                <Body fontSize={14} lineHeight={19} color={onCamera.textSoft} center>
                    {t('proof.scan.camera.slowBody')}
                </Body>
                {detail ? (
                    <Body fontFamily="$mono" fontSize={12} lineHeight={16} color={onCamera.textFaint} center testID={testID ? `${testID}-detail` : undefined}>
                        {detail}
                    </Body>
                ) : null}
            </YStack>
            <YStack alignSelf="stretch" gap={10} paddingTop={4}>
                <GlassAction icon="retry" label={t('proof.scan.camera.slowRetry')} onPress={onRetry} testID="proof-camera-retry" />
                <GlassAction icon="keyboard" label={t('proof.scan.camera.typeCode')} onPress={onType} testID="proof-camera-type" />
            </YStack>
        </YStack>
    );
}

/* -- The drawer's handle row (a surface of the app: theme tokens). -------------- */

/** How many item marks the handle draws before the words alone say it. */
const HANDLE_MARKS = 5;

/**
 * The row under the drawer's grip: how many items, a mark per item while there
 * are few enough, and what is left to do. Tapping it opens or closes the list;
 * so does pulling.
 */
export function DrawerHandleRow({
    title,
    marks,
    aside,
    open,
    label,
    onPress,
    testID,
}: {
    title: string;
    /** One per expected item, in order: scanned or not. Left out when there is no list to count against. */
    marks?: boolean[];
    aside?: string;
    open: boolean;
    label: string;
    onPress: () => void;
    testID?: string;
}) {
    const theme = useTheme();
    const soft = theme.textSecondary?.val as string;
    return (
        <XStack alignItems="center" gap={10} height={48} paddingHorizontal={16} onPress={onPress} pressStyle={{ opacity: 0.7 }} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }} testID={testID}>
            <ProofIcon name="box" size={20} color={soft} />
            <Body fontSize={18} lineHeight={23} fontWeight="800" tabular numberOfLines={1} flexShrink={0}>
                {title}
            </Body>
            {marks && marks.length > 0 && marks.length <= HANDLE_MARKS ? (
                <XStack alignItems="center" gap={4} marginStart={4} flexShrink={0}>
                    {marks.map((done, index) => (
                        <YStack
                            key={index}
                            width={22}
                            height={22}
                            borderRadius={11}
                            alignItems="center"
                            justifyContent="center"
                            borderWidth={1.5}
                            borderStyle={done ? 'solid' : 'dashed'}
                            borderColor={done ? '$successBorder' : '$textMuted'}
                            backgroundColor={done ? '$successFill' : '$transparent'}
                        >
                            {done ? <ProofIcon name="check" size={11} strokeWidth={4} color={theme.successText?.val as string} /> : null}
                        </YStack>
                    ))}
                </XStack>
            ) : null}
            <YStack flex={1} minWidth={8} />
            {aside ? (
                <Body flexShrink={1} fontSize={15} lineHeight={20} fontWeight="700" tabular tone="secondary" numberOfLines={1}>
                    {aside}
                </Body>
            ) : null}
            <ProofIcon name={open ? 'chevronDown' : 'chevronUp'} size={18} strokeWidth={2.6} color={theme.textMuted?.val as string} />
        </XStack>
    );
}

/* -- Typing a code (a surface of the app: theme tokens). ------------------------ */

/**
 * How much of the sheet the keyboard would cover.
 *
 * On iOS the keyboard says how tall it will be before it moves. On Android the
 * window usually resizes itself and nothing is covered; where it does not (a
 * modal drawn edge to edge), the sheet is measured once the keyboard is up and
 * whatever lies under it is the answer.
 */
function useKeyboardCover(sheet: RefObject<View | null>): number {
    const [cover, setCover] = useState(0);
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const ios = Platform.OS === 'ios';
        const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
            const coordinates = event?.endCoordinates;
            if (ios) {
                setCover(coordinates?.height ?? 0);
                return;
            }
            const keyboardTop = coordinates?.screenY ?? 0;
            if (!keyboardTop) return;
            // Given a moment to resize; what is still under the keyboard then is what to clear.
            timer = setTimeout(() => {
                sheet.current?.measureInWindow((_x, y, _width, height) => {
                    const under = Math.round(y + height - keyboardTop);
                    if (under > 8) setCover(under);
                });
            }, 120);
        });
        const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
            if (timer) clearTimeout(timer);
            setCover(0);
        });
        return () => {
            if (timer) clearTimeout(timer);
            show.remove();
            hide.remove();
        };
    }, [sheet]);
    return cover;
}

/**
 * A small sheet with one field, for a label the camera cannot read. What is
 * typed is handed to the screen exactly as a camera read is, so it is parsed,
 * matched and answered the same way.
 */
export function TypeCodeSheet({ visible, onClose, onSubmit, bottomInset = 0 }: { visible: boolean; onClose: () => void; onSubmit: (code: string) => void; bottomInset?: number }) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState('');
    const field = useRef<TextInput>(null);
    const sheet = useRef<View>(null);
    const cover = useKeyboardCover(sheet);

    useEffect(() => {
        if (!visible) return undefined;
        setDraft('');
        // After the sheet has risen: a field focused while it is still moving can lose the keyboard.
        const timer = setTimeout(() => field.current?.focus(), 300);
        return () => clearTimeout(timer);
    }, [visible]);

    const code = draft.trim();
    const submit = () => {
        if (!code) return;
        Keyboard.dismiss();
        onSubmit(code);
    };

    return (
        <SheetModal visible={visible} onClose={onClose} dismissLabel={t('common.close')} testID="proof-type-sheet">
            <View ref={sheet} collapsable={false}>
                <YStack padding={16} paddingBottom={Math.max(bottomInset, 16)} backgroundColor="$background" borderTopLeftRadius={26} borderTopRightRadius={26} borderWidth={1} borderColor="$border">
                    <YStack gap={12}>
                        <YStack gap={4}>
                            <Body fontSize={18} lineHeight={23} fontWeight="800">
                                {t('proof.scan.manual.title')}
                            </Body>
                            <Secondary>{t('proof.scan.manual.hint')}</Secondary>
                        </YStack>
                        <Field ref={field} value={draft} onChangeText={setDraft} placeholder={t('proof.scan.manual.placeholder')} autoCapitalize="characters" autoComplete="off" testID="proof-type-input" />
                        <XStack gap={10}>
                            <Button flex={1} height={52} variant="secondary" onPress={onClose} testID="proof-type-cancel">
                                {t('common.cancel')}
                            </Button>
                            <Button flex={1} height={52} disabled={!code} onPress={submit} testID="proof-type-submit">
                                {t('proof.scan.manual.submit')}
                            </Button>
                        </XStack>
                    </YStack>
                    {/* Room for the keyboard, as a sibling of the field's own stack: nothing above the field changes style while it is focused (see ui/Field). */}
                    <View style={{ height: cover }} />
                </YStack>
            </View>
        </SheetModal>
    );
}
