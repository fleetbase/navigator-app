/**
 * Recording a voice message: hold the microphone, let go to send, slide left to
 * delete, slide right to lock it and keep both hands free.
 *
 * Everything here runs against the `VoiceRecorder` in `voice.ts`. No recorder
 * is installed yet, so the composer only draws the microphone when
 * `VOICE_RECORDING_ENABLED` is true; see that file for what turning it on takes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, type PanResponderInstance } from 'react-native';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Secondary } from '../../ui/Text';
import { space } from '../../theme/tokens';
import { ChatIcon } from './icons';
import { formatSeconds } from './time';
import { MIN_RECORDING_MS, voiceRecorder, type VoiceRecording } from './voice';

type T = (key: string, options?: Record<string, unknown>) => string;

/** How far the thumb travels before a slide counts. */
const SLIDE = 72;

export type RecordPhase = 'idle' | 'holding' | 'locked';
export type SlideHint = 'delete' | 'lock' | null;

export interface HoldToRecord {
    phase: RecordPhase;
    hint: SlideHint;
    elapsedMs: number;
    /** Spread onto the microphone button. */
    handlers: PanResponderInstance['panHandlers'];
    /** For the locked state's buttons. */
    send: () => void;
    discard: () => void;
}

export function useHoldToRecord(onRecorded: (recording: VoiceRecording) => void): HoldToRecord {
    const [phase, setPhase] = useState<RecordPhase>('idle');
    const [hint, setHint] = useState<SlideHint>(null);
    const [elapsedMs, setElapsedMs] = useState(0);
    const phaseRef = useRef<RecordPhase>('idle');
    const startedAt = useRef(0);
    const onRecordedRef = useRef(onRecorded);
    onRecordedRef.current = onRecorded;

    const set = useCallback((next: RecordPhase) => {
        phaseRef.current = next;
        setPhase(next);
        if (next === 'idle') {
            setHint(null);
            setElapsedMs(0);
        }
    }, []);

    // The clock the driver watches; the recording's real length comes from the recorder.
    useEffect(() => {
        if (phase === 'idle') return;
        const timer = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 200);
        return () => clearInterval(timer);
    }, [phase]);

    const begin = useCallback(async () => {
        if (!voiceRecorder || phaseRef.current !== 'idle') return;
        startedAt.current = Date.now();
        set('holding');
        const started = await voiceRecorder.start().catch(() => false);
        // The thumb may already be up, or the driver refused the microphone.
        if (!started) set('idle');
    }, [set]);

    const discard = useCallback(() => {
        if (phaseRef.current === 'idle') return;
        set('idle');
        void voiceRecorder?.cancel().catch(() => {});
    }, [set]);

    const send = useCallback(() => {
        if (phaseRef.current === 'idle') return;
        const tooShort = Date.now() - startedAt.current < MIN_RECORDING_MS;
        set('idle');
        if (tooShort) {
            void voiceRecorder?.cancel().catch(() => {});
            return;
        }
        void voiceRecorder
            ?.stop()
            .then((recording) => {
                if (recording) onRecordedRef.current(recording);
            })
            .catch(() => {});
    }, [set]);

    const responder = useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onPanResponderTerminationRequest: () => false,
                onPanResponderGrant: () => void begin(),
                onPanResponderMove: (_e, g) => {
                    if (phaseRef.current !== 'holding') return;
                    setHint(g.dx <= -SLIDE ? 'delete' : g.dx >= SLIDE ? 'lock' : null);
                },
                onPanResponderRelease: (_e, g) => {
                    if (phaseRef.current !== 'holding') return;
                    if (g.dx <= -SLIDE) discard();
                    else if (g.dx >= SLIDE) {
                        setHint(null);
                        set('locked');
                    } else send();
                },
                // The system took the touch (a call, a notification pulled down): keep nothing.
                onPanResponderTerminate: () => discard(),
            }),
        [begin, discard, send, set]
    );

    // Leaving the screen mid-recording must not leave the microphone open.
    useEffect(() => () => void voiceRecorder?.cancel().catch(() => {}), []);

    return { phase, hint, elapsedMs, handlers: responder.panHandlers, send, discard };
}

const BARS = [14, 26, 40, 22, 34, 52, 30, 18, 44, 50, 24, 36, 12, 28, 46, 38, 20, 32, 54, 26, 16, 42, 30, 48, 22, 14, 36, 28, 18, 10];

/** The red dot that says the microphone is live. It blinks unless the driver asked for less motion. */
function LiveDot() {
    const opacity = useRef(new Animated.Value(1)).current;
    const theme = useTheme();
    useEffect(() => {
        let loop: Animated.CompositeAnimation | undefined;
        let gone = false;
        void AccessibilityInfo.isReduceMotionEnabled()
            .catch(() => false)
            .then((reduced) => {
                if (reduced || gone) return;
                loop = Animated.loop(
                    Animated.sequence([
                        Animated.timing(opacity, { toValue: 0.25, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                        Animated.timing(opacity, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                    ])
                );
                loop.start();
            });
        return () => {
            gone = true;
            loop?.stop();
        };
    }, [opacity]);
    return <Animated.View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.dangerText?.val as string, opacity }} />;
}

/** The panel that rises over the conversation while a recording is being made. */
export function RecordPanel({ recorder, t }: { recorder: HoldToRecord; t: T }) {
    const theme = useTheme();
    if (recorder.phase === 'idle') return null;
    const locked = recorder.phase === 'locked';

    return (
        <YStack
            paddingTop={18}
            paddingHorizontal={space[4]}
            paddingBottom={space[3]}
            gap={18}
            borderTopLeftRadius={26}
            borderTopRightRadius={26}
            backgroundColor="$surface"
            borderTopWidth={1}
            borderColor="$border"
            testID="record-panel"
        >
            <XStack alignItems="center" justifyContent="space-between">
                <XStack alignItems="center" gap={10}>
                    <LiveDot />
                    <Body fontSize={15} lineHeight={20} fontWeight="800">
                        {t('chat.record.recording')}
                    </Body>
                </XStack>
                <Body fontSize={34} lineHeight={40} fontWeight="800" tabular accessibilityRole="timer" testID="record-timer">
                    {formatSeconds(recorder.elapsedMs / 1000)}
                </Body>
            </XStack>

            <XStack height={56} alignItems="center" justifyContent="space-between" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {BARS.map((height, i) => (
                    <YStack key={i} width={4} height={height} borderRadius={2} backgroundColor="$primary" opacity={0.75} />
                ))}
            </XStack>

            <XStack alignItems="center" justifyContent="space-between" gap={space[3]}>
                <XStack
                    flex={1}
                    height={52}
                    alignItems="center"
                    justifyContent="center"
                    gap={space[2]}
                    borderRadius={16}
                    borderWidth={1}
                    borderColor="$dangerBorder"
                    backgroundColor="$dangerFill"
                    opacity={locked || recorder.hint === 'delete' ? 1 : 0.6}
                    onPress={locked ? recorder.discard : undefined}
                    pressStyle={locked ? { opacity: 0.7 } : undefined}
                    accessibilityRole={locked ? 'button' : undefined}
                    testID="record-delete"
                >
                    <ChatIcon name="trash" size={18} color={theme.dangerText?.val as string} />
                    <Body fontSize={15} lineHeight={20} fontWeight="800" tone="danger" numberOfLines={1}>
                        {t('chat.record.delete')}
                    </Body>
                </XStack>
                {locked ? (
                    <XStack
                        flex={1}
                        height={52}
                        alignItems="center"
                        justifyContent="center"
                        gap={space[2]}
                        borderRadius={16}
                        backgroundColor="$primary"
                        onPress={recorder.send}
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityRole="button"
                        testID="record-send"
                    >
                        <ChatIcon name="send" size={18} color={theme.onPrimary?.val as string} />
                        <Body fontSize={15} lineHeight={20} fontWeight="800" color="$onPrimary" numberOfLines={1}>
                            {t('chat.record.send')}
                        </Body>
                    </XStack>
                ) : (
                    <XStack
                        flex={1}
                        height={52}
                        alignItems="center"
                        justifyContent="center"
                        gap={space[2]}
                        borderRadius={16}
                        borderWidth={1}
                        borderColor="$border"
                        backgroundColor="$surfaceRaised"
                        opacity={recorder.hint === 'lock' ? 1 : 0.6}
                        testID="record-lock"
                    >
                        <ChatIcon name="lock" size={18} color={theme.textPrimary?.val as string} />
                        <Body fontSize={15} lineHeight={20} fontWeight="800" numberOfLines={1}>
                            {t('chat.record.lock')}
                        </Body>
                    </XStack>
                )}
            </XStack>

            <Secondary fontSize={14} lineHeight={20} textAlign="center">
                {locked ? t('chat.record.lockedHint') : t('chat.record.holdHint')}
            </Secondary>
        </YStack>
    );
}
