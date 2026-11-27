/**
 * Slide to confirm: a thumb dragged across a track.
 *
 * Used where a tap is too easy to make by accident — moving an order on to its
 * next step from a phone in a cradle or a pocket. Only a slide carried to the
 * end confirms; letting go before the end sends the thumb back and nothing
 * happens.
 *
 * A slide is not something every driver can do, so it is never the only way:
 *
 *   - with a screen reader on, the track is replaced by a plain Confirm button
 *     (a double tap confirms);
 *   - the track itself is `adjustable` and answers the screen reader's
 *     "activate" and "increment", for the moment before the app has learned
 *     that a screen reader is on.
 *
 * With reduced motion on, the thumb does not glide back: it is simply back.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { YStack, useTheme } from 'tamagui';
import { Body } from '../../ui/Text';
import { Button } from '../../ui/Button';

/** The track: at least 56 high, as tall as the step button it stands in for. */
const TRACK_HEIGHT = 60;
const TRACK_RADIUS = 16;
const BORDER = 1.5;
const INSET = 4;
/** The thumb sits inside the track's border with the same air on every side. */
const THUMB = TRACK_HEIGHT - BORDER * 2 - INSET * 2;
/** How much of the way counts as "to the end": a finger rarely lands on the last pixel. */
const ENOUGH = 0.9;

export function SlideToConfirm({
    label,
    accessibilityLabel,
    confirmLabel,
    onConfirm,
    disabled,
    testID = 'slide-to-confirm',
}: {
    /** Written on the track: "Slide to confirm". */
    label: string;
    /** Spoken for the control: what confirming does ("Update this order to Driver en route"). */
    accessibilityLabel: string;
    /** The button a screen-reader user gets instead of the track: "Confirm". */
    confirmLabel: string;
    onConfirm: () => void;
    disabled?: boolean;
    testID?: string;
}) {
    const theme = useTheme();
    const x = useRef(new Animated.Value(0)).current;
    const [width, setWidth] = useState(0);
    const [screenReader, setScreenReader] = useState(false);

    // Read by the gesture, which is built once: always the latest values.
    const travel = useRef(0);
    travel.current = Math.max(0, width - BORDER * 2 - THUMB - INSET * 2);
    const live = useRef({ disabled: !!disabled, onConfirm, reduceMotion: false, done: false });
    live.current.disabled = !!disabled;
    live.current.onConfirm = onConfirm;

    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isScreenReaderEnabled()
            .then((on) => mounted && setScreenReader(!!on))
            .catch(() => undefined);
        AccessibilityInfo.isReduceMotionEnabled()
            .then((on) => {
                live.current.reduceMotion = !!on;
            })
            .catch(() => undefined);
        const reader = AccessibilityInfo.addEventListener('screenReaderChanged', (on) => setScreenReader(!!on));
        const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
            live.current.reduceMotion = !!on;
        });
        return () => {
            mounted = false;
            reader?.remove?.();
            motion?.remove?.();
        };
    }, []);

    const confirm = () => {
        if (live.current.disabled || live.current.done) return;
        live.current.done = true;
        live.current.onConfirm();
    };

    const responder = useMemo(() => {
        const back = () => {
            if (live.current.reduceMotion) {
                x.setValue(0);
                return;
            }
            Animated.timing(x, { toValue: 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        };
        return PanResponder.create({
            onStartShouldSetPanResponder: () => !live.current.disabled && !live.current.done,
            onMoveShouldSetPanResponder: () => !live.current.disabled && !live.current.done,
            // Once the thumb is held, a scroll view or a sheet underneath does not take the drag away.
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: () => {
                x.stopAnimation();
            },
            onPanResponderMove: (_event, gesture) => {
                x.setValue(Math.min(travel.current, Math.max(0, gesture.dx)));
            },
            onPanResponderRelease: (_event, gesture) => {
                if (travel.current > 0 && gesture.dx >= travel.current * ENOUGH) {
                    x.setValue(travel.current);
                    confirm();
                    return;
                }
                back();
            },
            onPanResponderTerminate: back,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [x]);

    if (screenReader) {
        return (
            <Button fullWidth height={TRACK_HEIGHT} borderRadius={TRACK_RADIUS} variant="primary" disabled={disabled} onPress={confirm} accessibilityLabel={accessibilityLabel} testID={`${testID}-button`}>
                {confirmLabel}
            </Button>
        );
    }

    const onPrimary = theme.onPrimary?.val as string;
    // The words fade as the thumb covers them.
    const labelOpacity = x.interpolate({ inputRange: [0, Math.max(1, travel.current * 0.6)], outputRange: [1, 0], extrapolate: 'clamp' });

    return (
        <YStack
            height={TRACK_HEIGHT}
            borderRadius={TRACK_RADIUS}
            backgroundColor="$primaryFill"
            borderWidth={BORDER}
            borderColor="$primary"
            opacity={disabled ? 0.38 : 1}
            onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={label}
            accessibilityState={{ disabled: !!disabled }}
            accessibilityActions={[{ name: 'activate' }, { name: 'increment' }]}
            onAccessibilityAction={(event) => {
                const name = event.nativeEvent.actionName;
                if (name === 'activate' || name === 'increment') confirm();
            }}
            testID={testID}
        >
            {/* Clear of the thumb's resting place, so the words are never under it. */}
            <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: THUMB + INSET * 2, right: INSET * 3, alignItems: 'center', justifyContent: 'center', opacity: labelOpacity }} pointerEvents="none">
                <Body fontSize={16} lineHeight={21} fontWeight="800" numberOfLines={1} adjustsFontSizeToFit>
                    {label}
                </Body>
            </Animated.View>
            <Animated.View
                {...responder.panHandlers}
                // The whole thumb, and a little above, below and ahead of it, takes the finger. Nothing
                // behind it: that is the edge of the screen, which belongs to the system's swipe back.
                hitSlop={{ top: 8, bottom: 8, left: 0, right: 16 }}
                style={{
                    position: 'absolute',
                    top: INSET,
                    left: INSET,
                    width: THUMB,
                    height: THUMB,
                    borderRadius: TRACK_RADIUS - INSET,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.primary?.val as string,
                    transform: [{ translateX: x }],
                }}
                testID={`${testID}-thumb`}
            >
                <View pointerEvents="none">
                    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={onPrimary} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M6 6l6 6-6 6" />
                        <Path d="M13 6l6 6-6 6" />
                    </Svg>
                </View>
            </Animated.View>
        </YStack>
    );
}

export default SlideToConfirm;
