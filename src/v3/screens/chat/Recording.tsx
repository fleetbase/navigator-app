/**
 * Recording a voice message: hold the microphone, let go to send, slide left to
 * delete, slide right to lock it and keep both hands free.
 *
 * Everything here runs against the `VoiceRecorder` interface in `voice.ts`;
 * the recorder itself is in `recorder.ts`. The browser build has none, and the
 * composer draws no microphone there.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, type PanResponderInstance } from 'react-native';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Secondary } from '../../ui/Text';
import { space } from '../../theme/tokens';
import { ChatIcon } from './icons';
import { formatSeconds } from './time';
import { stopPlayback } from './AudioPlayer';
import { voiceRecorder } from './recorder';
import { MAX_RECORDING_MS, MIN_RECORDING_MS, type VoiceRecording } from './voice';

type T = (key: string, options?: Record<string, unknown>) => string;

/** How far the thumb travels before a slide counts. */
const SLIDE = 72;

export type RecordPhase = 'idle' | 'holding' | 'locked';
export type SlideHint = 'delete' | 'lock' | null;

export interface HoldToRecord {
    phase: RecordPhase;
    hint: SlideHint;
    elapsedMs: number;
    /** The microphone's recent levels, oldest first, each 0 to 1. Empty until the recorder reports one. */
    levels: number[];
    /** Spread onto the microphone button. */
    handlers: PanResponderInstance['panHandlers'];
    /** For the locked state's buttons. */
    send: () => void;
    discard: () => void;
}

/** Why a hold did not become a recording: the driver refused the microphone, or the recorder would not start. */
export type RecordRefusal = 'denied' | 'failed';

export function useHoldToRecord(onRecorded: (recording: VoiceRecording) => void, onRefused?: (why: RecordRefusal) => void): HoldToRecord {
    const [phase, setPhase] = useState<RecordPhase>('idle');
    const [hint, setHint] = useState<SlideHint>(null);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [levels, setLevels] = useState<number[]>([]);
    const phaseRef = useRef<RecordPhase>('idle');
    const startedAt = useRef(0);
    const onRecordedRef = useRef(onRecorded);
    onRecordedRef.current = onRecorded;
    const onRefusedRef = useRef(onRefused);
    onRefusedRef.current = onRefused;

    const set = useCallback((next: RecordPhase) => {
        phaseRef.current = next;
        setPhase(next);
        if (next === 'idle') {
            setHint(null);
            setElapsedMs(0);
            setLevels([]);
        }
    }, []);

    const begin = useCallback(async () => {
        if (!voiceRecorder || phaseRef.current !== 'idle') return;
        startedAt.current = Date.now();
        set('holding');
        // A voice message left playing would be recorded into this one.
        stopPlayback();
        const outcome = await voiceRecorder.start().catch(() => 'failed' as const);
        if (outcome === 'started') {
            // The clock counts what was recorded, not the moment spent waking the microphone.
            startedAt.current = Date.now();
            return;
        }
        // The thumb may already be up; either way nothing is recording.
        set('idle');
        // `asked` needs no words: the driver just said yes, and holds the button again.
        if (outcome === 'denied' || outcome === 'failed') onRefusedRef.current?.(outcome);
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

    // The clock the driver watches; the recording's real length comes from the recorder.
    useEffect(() => {
        if (phase === 'idle') return;
        const timer = setInterval(() => {
            const elapsed = Date.now() - startedAt.current;
            setElapsedMs(elapsed);
            // Long enough: send what there is rather than let it grow.
            if (elapsed >= MAX_RECORDING_MS) send();
        }, 200);
        return () => clearInterval(timer);
    }, [phase, send]);

    // The live level, as a short history the panel draws as bars.
    useEffect(() => {
        if (phase === 'idle' || !voiceRecorder) return;
        return voiceRecorder.onLevel((level) => setLevels((recent) => [...recent, level].slice(-BARS.length)));
    }, [phase]);

    // Leaving the screen mid-recording must not leave the microphone open.
    useEffect(() => () => void voiceRecorder?.cancel().catch(() => {}), []);

    return { phase, hint, elapsedMs, levels, handlers: responder.panHandlers, send, discard };
}

/** The resting shape, drawn until the microphone reports a level (and on a device whose recorder never does). */
const BARS = [14, 26, 40, 22, 34, 52, 30, 18, 44, 50, 24, 36, 12, 28, 46, 38, 20, 32, 54, 26, 16, 42, 30, 48, 22, 14, 36, 28, 18, 10];
const BAR_MIN = 6;
const BAR_MAX = 54;

/** What to draw: the newest levels on the right, silence before them. */
function barHeights(levels: number[]): number[] {
    if (!levels.length) return BARS;
    const quiet = Array.from({ length: BARS.length - levels.length }, () => BAR_MIN);
    return [...quiet, ...levels.map((level) => BAR_MIN + level * (BAR_MAX - BAR_MIN))];
}

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
                {barHeights(recorder.levels).map((height, i) => (
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
