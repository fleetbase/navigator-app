/**
 * Proof by signature (design round 3: SignatureA "full-screen pad", SignatureB
 * "turn the phone", and SignatureStates).
 *
 * The pad is the screen. Two ways of signing on it, the same signature in both:
 *
 *   - **upright** (A): the pad takes almost the whole screen. A round close
 *     button and a slim strip say what is being signed for; under the pad are a
 *     quiet Clear, a line of status, and the one button, "Complete step".
 *   - **on its side** (B): one long signing line across the width, a one-line
 *     summary over it, Clear on the left and Done on the right, both large.
 *
 * How the wide layout is reached. The app is not locked to portrait, so a phone
 * that turns its screen shows B by itself (the window is wider than it is
 * tall). Most phones in a van have rotation locked, so the upright pad also
 * carries "Turn to sign": that draws the same wide layout turned a quarter turn
 * inside the upright window, and the driver turns the phone. No native change,
 * no orientation library. What has been signed is carried from one pad to the
 * other (SignaturePad's `refitInk`).
 *
 * What a signature *is* has not changed: a PNG in base64 sent to
 * `capture-signature` with the step's code as its remark, recorded in the proof
 * ledger, and the order completes the step on return.
 *
 *   - sent: the success moment, then back to the order;
 *   - no signal: the app keeps it to send (the queue's answer); the proof is
 *     recorded as waiting, the driver is told, calmly, and taken back;
 *   - refused, or could not be sent or kept: the reason is shown, the signature
 *     stays on the pad, and "Try again" sends the same one;
 *   - a dot or a tiny mark is not sent: "Please sign across the line".
 *
 * The person signing is not the driver. The driver's controls (close, Clear,
 * turning the phone) are at the edges and corners, away from the signing line
 * where the hand rests.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StatusBar, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, XStack, YStack, useTheme } from 'tamagui';
import { Body } from '../../ui/Text';
import { onCamera } from '../../ui/Scanner';
import { haptic } from '../../ui/haptics';
import { useTranslation } from '../../i18n/useTranslation';
import { useProofCapture, type ProofOutcome } from '../../data/useProofCapture';
import { recordProof } from '../../data/proofLedger';
import { useOrder } from '../../data/useOrders';
import { customerNameOf, payloadOf, trackingNumberOf } from '../../data/accessors';
import { orderStops } from '../../data/orderStops';
import { placeLines } from '../../data/placeText';
import { formatClock } from '../../format';
import { MessageCard, PrimaryAction, ProofIcon, Rise, ScannedCard, type MessageLine, type ProofIconName } from './parts';
import { NO_INK, PAD, SignaturePad, isSignature, type Ink, type SignaturePadHandle } from './SignaturePad';

/** "Signature sent" is shown this long before going back to the order by itself. */
const SENT_MS = 1600;
/** "Saved on this phone" is shown this long before going back to the order by itself (as on the scan screen). */
const SAVED_MS = 4000;
/** The shell's strip about signal and syncing floats this far under the top edge, and is about this tall. */
const SHELL_STRIP_OFFSET = 54;
const SHELL_STRIP_ROOM = 44;

type Phase = 'signing' | 'sending' | 'sent' | 'saved';

/** Why the signature did not go. `server` carries what the server said. */
type Problem = { kind: 'server'; message: string } | { kind: 'noSignal' } | { kind: 'unknown' } | { kind: 'unreadable' };

export interface ProofSignatureProps {
    orderId: string;
    /** The activity being advanced into: it is the one asking for the signature. */
    activityCode: string;
    activityLabel: string;
    /** The order's item numbers, as the order screen passed them: counted when the order's own list is not to hand. */
    expected: string[];
    /** Proof for one entity rather than the whole order. */
    subjectId?: string;
    /** The shell's strip about signal and syncing is floating under the top row: room is left for it. */
    stripShowing?: boolean;
    onCaptured?: (outcome: ProofOutcome) => void;
    onCancel?: () => void;
}

/* -- The screen's own pieces (surfaces of the app: theme tokens). ---------------- */

/** The round close button of the top row: the scan screen's, on the theme's surface instead of over a camera. */
function RoundButton({ icon, label, onPress, testID }: { icon: ProofIconName; label: string; onPress?: () => void; testID?: string }) {
    const theme = useTheme();
    return (
        <YStack
            width={48}
            height={48}
            borderRadius={24}
            flexShrink={0}
            alignItems="center"
            justifyContent="center"
            backgroundColor="$surface"
            borderWidth={1}
            borderColor="$border"
            onPress={onPress}
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityLabel={label}
            testID={testID}
        >
            <ProofIcon name={icon} size={18} strokeWidth={2.6} color={theme.textPrimary?.val as string} />
        </YStack>
    );
}

/** A quiet 48-high pill with an icon and a word: Clear under the upright pad, the way back to upright on the wide one. */
function QuietPill({ icon, label, hint, onPress, testID }: { icon: ProofIconName; label: string; hint?: string; onPress?: () => void; testID?: string }) {
    const theme = useTheme();
    return (
        <XStack
            alignItems="center"
            gap={8}
            height={48}
            paddingHorizontal={18}
            borderRadius={24}
            flexShrink={0}
            backgroundColor="$surface"
            borderWidth={1}
            borderColor="$border"
            onPress={onPress}
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityLabel={hint ?? label}
            testID={testID}
        >
            <ProofIcon name={icon} size={18} strokeWidth={2.4} color={theme.textSecondary?.val as string} />
            <Body fontSize={15} lineHeight={20} fontWeight="700" tone="secondary" numberOfLines={1}>
                {label}
            </Body>
        </XStack>
    );
}

/**
 * A large button that is not the 60-high primary one: the wide layout's Clear
 * and Done (56 high), the upright layout's "Sign to continue" (the primary
 * button switched off, saying why) and its Clear when a mark is too small.
 */
function LargeButton({
    kind,
    label,
    icon,
    height,
    width,
    loading,
    dim,
    onPress,
    testID,
}: {
    /** `off` is a button that cannot be pressed yet and says why. */
    kind: 'primary' | 'secondary' | 'off';
    label: string;
    icon?: ProofIconName;
    height: number;
    width?: number;
    loading?: boolean;
    /** Nothing for it to do yet (Clear with no ink): shown faint, and inert. */
    dim?: boolean;
    onPress?: () => void;
    testID?: string;
}) {
    const theme = useTheme();
    const inert = kind === 'off' || !!loading || !!dim;
    const ink = (kind === 'primary' ? theme.onPrimary?.val : kind === 'off' ? theme.textMuted?.val : theme.textPrimary?.val) as string;
    return (
        <XStack
            alignItems="center"
            justifyContent="center"
            gap={10}
            height={height}
            width={width}
            flexShrink={0}
            paddingHorizontal={16}
            borderRadius={16}
            backgroundColor={kind === 'primary' ? '$primary' : '$surfaceRaised'}
            borderWidth={kind === 'primary' ? 0 : 1}
            borderColor="$border"
            opacity={dim ? 0.5 : 1}
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
                    {icon ? <ProofIcon name={icon} size={20} strokeWidth={icon === 'check' ? 3 : icon === 'pencil' ? 2.2 : 2.6} color={ink} /> : null}
                    <Body fontSize={18} lineHeight={23} fontWeight="800" color={ink} numberOfLines={1}>
                        {label}
                    </Body>
                </>
            )}
        </XStack>
    );
}

/** "Please sign across the line": amber, with its own mark and its own words. */
function TooSmallNotice({ label, testID }: { label: string; testID?: string }) {
    return (
        <XStack
            alignItems="center"
            gap={10}
            minHeight={48}
            paddingHorizontal={14}
            paddingVertical={6}
            borderRadius={16}
            backgroundColor="$warningFill"
            borderWidth={1.5}
            borderColor="$warningBorder"
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={label}
            testID={testID}
        >
            <YStack width={28} height={28} borderRadius={14} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor="$warning">
                <ProofIcon name="pencil" size={16} strokeWidth={2.8} color={onCamera.onWarning} />
            </YStack>
            <Body flexShrink={1} fontSize={17} lineHeight={22} fontWeight="800" tone="warning">
                {label}
            </Body>
        </XStack>
    );
}

/* -- The screen. ---------------------------------------------------------------- */

export function ProofSignature({ orderId, activityCode, activityLabel, expected, subjectId, stripShowing, onCaptured, onCancel }: ProofSignatureProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const windowSize = useWindowDimensions();
    const { capture, lastProofId, lastFailure } = useProofCapture(orderId);
    const order = useOrder(orderId || undefined);

    /* -- What is being signed for. --------------------------------------------- */

    const payload = payloadOf(order);
    const stops = orderStops(payload);
    // The waypoint the order is at, when the order says; otherwise its drop-off, which is where a signature is asked for.
    const stop = stops.find((candidate) => !!candidate.id && candidate.id === payload.current_waypoint) ?? stops.find((candidate) => candidate.type === 'dropoff') ?? stops[stops.length - 1];
    const placeName = placeLines(stop as Record<string, unknown> | undefined).title;
    const itemCount = (payload.entities ?? []).length || expected.length;
    const itemsText = itemCount > 0 ? t('ui.itemCount', { count: itemCount }) : undefined;
    const orderNumber = trackingNumberOf(order);
    const signer = customerNameOf(order)?.trim() || undefined;
    const summaryLabel = [t('proof.scan.proofFor', { step: activityLabel }), placeName, itemsText, orderNumber].filter(Boolean).join('. ');

    /* -- What has been signed, and what came of sending it. ---------------------- */

    const [ink, setInk] = useState<Ink>(NO_INK);
    const inkRef = useRef(ink);
    const [signedAt, setSignedAt] = useState<string | undefined>(undefined);
    const [phase, setPhase] = useState<Phase>('signing');
    const [problem, setProblem] = useState<Problem | null>(null);
    const [tooSmall, setTooSmall] = useState(false);
    const [sentAt, setSentAt] = useState('');
    /** The wide layout was asked for with "Turn to sign" (the window itself is still upright). */
    const [turned, setTurned] = useState(false);

    const pad = useRef<SignaturePadHandle>(null);
    const busy = useRef(false);
    const alive = useRef(true);
    const left = useRef(false);
    const leavingWith = useRef<ProofOutcome | null>(null);
    const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            if (leaveTimer.current) clearTimeout(leaveTimer.current);
        };
    }, []);

    const onInk = useCallback((next: Ink) => {
        const added = next.strokes.length > inkRef.current.strokes.length;
        inkRef.current = next;
        setInk(next);
        if (!added) return;
        // A new stroke: the signer has moved on from whatever was said.
        setSignedAt(formatClock(new Date().toISOString()));
        setProblem(null);
        if (isSignature(next.strokes)) setTooSmall(false);
    }, []);

    const clear = useCallback(() => {
        if (busy.current || leavingWith.current) return;
        inkRef.current = NO_INK;
        setInk(NO_INK);
        setSignedAt(undefined);
        setProblem(null);
        setTooSmall(false);
    }, []);

    /** Back to the order, once. */
    const leave = useCallback(() => {
        if (left.current || !leavingWith.current) return;
        left.current = true;
        if (leaveTimer.current) clearTimeout(leaveTimer.current);
        onCaptured?.(leavingWith.current);
    }, [onCaptured]);

    const close = useCallback(() => {
        // The proof is already recorded: closing is going back with it.
        if (leavingWith.current) leave();
        else onCancel?.();
    }, [leave, onCancel]);

    const submit = useCallback(async () => {
        if (busy.current || leavingWith.current) return;
        const strokes = inkRef.current.strokes;
        if (!strokes.length) return;
        if (!isSignature(strokes)) {
            // A dot or a tiny mark: not sent. Said, with Clear to start again; more ink puts it right too.
            setProblem(null);
            setTooSmall(true);
            haptic('rejected');
            AccessibilityInfo.announceForAccessibility(t('proof.signature.tooSmall'));
            return;
        }
        busy.current = true;
        setProblem(null);
        setTooSmall(false);
        setPhase('sending');

        const fail = (why: Problem) => {
            busy.current = false;
            if (!alive.current) return;
            setProblem(why);
            setPhase('signing');
            haptic('rejected');
        };

        const image = await pad.current?.read();
        if (!image) {
            fail({ kind: 'unreadable' });
            return;
        }
        // As before: the image in base64, and the step's code as the remark.
        const outcome = await capture({ method: 'signature', signature: image, remarks: activityCode }, subjectId);
        if (outcome === 'failed') {
            const failure = lastFailure();
            fail(failure?.transport ? { kind: 'noSignal' } : failure?.message ? { kind: 'server', message: failure.message } : { kind: 'unknown' });
            return;
        }
        /*
         * Recorded against the activity it was captured for, so the order screen
         * completes the step on return instead of opening this screen again.
         * Whole-order proof only: a per-item capture does not satisfy the activity.
         */
        if (!subjectId) recordProof(orderId, activityCode, { proofId: lastProofId(), queued: outcome === 'queued' });
        busy.current = false;
        // Closed while it was sending: the proof stands, and there is no screen left to go back from.
        if (!alive.current) return;
        leavingWith.current = outcome;
        if (outcome === 'queued') {
            // No signal: the app is keeping it to send. Said calmly, then back to the order (or at a tap).
            setPhase('saved');
            AccessibilityInfo.announceForAccessibility(`${t('proof.signature.savedTitle')}. ${t('proof.signature.savedBody')}`);
            leaveTimer.current = setTimeout(leave, SAVED_MS);
            return;
        }
        setSentAt(formatClock(new Date().toISOString()));
        setPhase('sent');
        haptic('success');
        AccessibilityInfo.announceForAccessibility(`${t('proof.signature.sentTitle')}. ${t('proof.signature.sentBody')}`);
        leaveTimer.current = setTimeout(leave, SENT_MS);
    }, [capture, lastFailure, lastProofId, activityCode, subjectId, orderId, leave, t]);

    /* -- Which layout. ----------------------------------------------------------- */

    // The screen's own size, once it is known: what the turned layout is cut to.
    const [box, setBox] = useState<{ width: number; height: number } | null>(null);
    const onRootLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width <= 0 || height <= 0) return;
        setBox((current) => (current && current.width === width && current.height === height ? current : { width, height }));
    }, []);
    const screenWidth = box?.width ?? windowSize.width;
    const screenHeight = box?.height ?? windowSize.height;
    /** The phone has turned its own screen: the wide layout, upright in a wide window. */
    const landscape = screenWidth > screenHeight;
    /** The wide layout drawn a quarter turn round inside an upright window. */
    const sideways = turned && !landscape;
    const wide = landscape || sideways;

    // Once the screen has turned by itself, "Turn to sign" has nothing left to do: back upright is the upright layout.
    useEffect(() => {
        if (landscape && turned) setTurned(false);
    }, [landscape, turned]);

    /* -- What there is to show. ---------------------------------------------------- */

    const hasInk = ink.strokes.length > 0;
    const sending = phase === 'sending';
    const leaving = phase === 'sent' || phase === 'saved';
    const locked = sending || leaving;

    const problemLines: MessageLine[] = [];
    if (problem) {
        if (problem.kind === 'server') {
            // The server's own reason, as it gave it.
            problemLines.push({ text: t('proof.signature.serverSaid'), look: 'soft' });
            problemLines.push({ text: t('proof.signature.serverQuote', { reason: problem.message }), look: 'strong' });
        } else {
            problemLines.push({ text: t(`proof.signature.failure.${problem.kind}`), look: 'bright' });
        }
        problemLines.push({ text: t('proof.signature.kept') });
    }

    /** What rises over the foot of the pad: the success moment, "saved on this phone", or why it was not sent. */
    const card =
        phase === 'sent' ? (
            <Rise key="sent" from={80}>
                <ScannedCard caption={t('proof.signature.sentCaption', { time: sentAt })} name={t('proof.signature.sentTitle')} note={t('proof.signature.sentBody')} testID="proof-signature-sent" />
            </Rise>
        ) : phase === 'saved' ? (
            <Rise key="saved" from={80}>
                <MessageCard
                    tone="calm"
                    icon="noSignal"
                    title={t('proof.signature.savedTitle')}
                    lines={[{ text: t('proof.signature.savedBody'), look: 'bright' }, { text: t('proof.signature.savedNext') }]}
                    testID="proof-signature-saved"
                />
            </Rise>
        ) : problem ? (
            <Rise key="problem" from={80}>
                <MessageCard tone="danger" icon="alert" alert title={t('proof.signature.failedTitle')} lines={problemLines} testID="proof-error" />
            </Rise>
        ) : null;

    /** The one button, in whichever state it is in. `Done` is its name on the wide layout. */
    const mainAction = (height: number, width?: number) => {
        if (leaving) {
            return height === 60 ? (
                <PrimaryAction label={t('proof.signature.continue')} onPress={leave} testID="proof-submit-signature" />
            ) : (
                <LargeButton kind="primary" label={t('proof.signature.continue')} height={height} width={width} onPress={leave} testID="proof-submit-signature" />
            );
        }
        if (problem) {
            return height === 60 ? (
                <PrimaryAction label={t('proof.signature.tryAgain')} icon="retry" loading={sending} onPress={() => void submit()} testID="proof-submit-signature" />
            ) : (
                <LargeButton kind="primary" label={t('proof.signature.tryAgain')} icon="retry" height={height} width={width} loading={sending} onPress={() => void submit()} testID="proof-submit-signature" />
            );
        }
        if (!hasInk || (tooSmall && wide)) {
            // Off, and saying why.
            return <LargeButton kind="off" label={t('proof.signature.signToContinue')} icon="pencil" height={height} width={width} testID="proof-submit-signature" />;
        }
        if (tooSmall) {
            // Upright, the button's place is given to Clear: the mark is to be started again.
            return <LargeButton kind="secondary" label={t('proof.clear')} icon="retry" height={height} width={width} onPress={clear} testID="proof-signature-clear-mark" />;
        }
        return height === 60 ? (
            <PrimaryAction label={t('proof.signature.complete')} icon="check" loading={sending} onPress={() => void submit()} testID="proof-submit-signature" />
        ) : (
            <LargeButton kind="primary" label={t('proof.signature.done')} icon="check" height={height} width={width} loading={sending} onPress={() => void submit()} testID="proof-submit-signature" />
        );
    };

    const signingPad = (variant: 'upright' | 'wide') => (
        <SignaturePad
            ref={pad}
            ink={ink}
            onInk={onInk}
            variant={variant}
            locked={locked}
            turned={sideways}
            hint={t('proof.signature.signHere')}
            signer={signer}
            time={hasInk ? signedAt : undefined}
            label={t('proof.signature.pad')}
            testID="proof-signature-pad"
        >
            {variant === 'upright' && !locked ? (
                /*
                 * "Turn to sign", in the pad's top corner: as far from the signing
                 * line as the pad goes, so it is not under the signer's hand. It
                 * carries its own dark backing, since it sits on the light pad.
                 */
                <XStack
                    position="absolute"
                    right={10}
                    top={10}
                    alignItems="center"
                    gap={8}
                    height={48}
                    paddingHorizontal={16}
                    borderRadius={24}
                    backgroundColor={PAD.ink}
                    onPress={() => setTurned(true)}
                    pressStyle={{ opacity: 0.7 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('proof.signature.turnLabel')}
                    testID="proof-signature-turn"
                >
                    <ProofIcon name="turn" size={20} strokeWidth={2} color={PAD.surface} />
                    <Body fontSize={15} lineHeight={20} fontWeight="700" color={PAD.surface} numberOfLines={1}>
                        {t('proof.signature.turn')}
                    </Body>
                </XStack>
            ) : null}
        </SignaturePad>
    );

    const background = theme.background?.val as string;

    /* -- Upright (SignatureA, 390 by 844). --------------------------------------- */

    const uprightLayout = () => {
        const top = Math.max(insets.top, 16) + 1;
        const bottom = Math.max(insets.bottom - 6, 16);
        return (
            <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: top, paddingBottom: bottom, gap: 12 }} testID="proof-signature">
                {/* Top: close, and a slim strip saying what is being signed for. */}
                <XStack alignItems="center" gap={10} minHeight={56}>
                    <RoundButton icon="close" label={t('proof.signature.close')} onPress={close} testID="proof-cancel" />
                    <YStack flex={1} minWidth={0} minHeight={56} paddingHorizontal={16} paddingVertical={6} borderRadius={18} justifyContent="center" backgroundColor="$surface" borderWidth={1} borderColor="$border" accessible accessibilityLabel={summaryLabel} testID="proof-activity">
                        <Body fontSize={17} lineHeight={22} fontWeight="800" tabular numberOfLines={1}>
                            {[placeName, itemsText].filter(Boolean).join(' · ') || activityLabel}
                        </Body>
                        {/* In full, never cut: it wraps before it is shortened. */}
                        {orderNumber ? (
                            <Body fontFamily="$mono" fontSize={14} lineHeight={18} fontWeight="600" tone="secondary">
                                {orderNumber}
                            </Body>
                        ) : null}
                    </YStack>
                </XStack>

                {/* The shell's strip about signal floats here when it shows: the pad starts under it. */}
                {stripShowing ? <View style={{ height: SHELL_STRIP_ROOM - 12 }} /> : null}

                {signingPad('upright')}

                {/* Beside the pad: Clear, quiet, once there is ink; and what to do next. */}
                {tooSmall ? (
                    <TooSmallNotice label={t('proof.signature.tooSmall')} testID="proof-signature-too-small" />
                ) : (
                    <XStack alignItems="center" justifyContent="space-between" gap={12} height={48}>
                        {hasInk && !locked ? <QuietPill icon="retry" label={t('proof.clear')} onPress={clear} testID="proof-signature-clear" /> : <View />}
                        {sending ? (
                            <Body flexShrink={1} fontSize={14} lineHeight={18} fontWeight="700" tone="secondary" numberOfLines={2} testID="proof-method">
                                {t('proof.signature.sending')}
                            </Body>
                        ) : hasInk && !leaving ? (
                            <XStack flexShrink={1} alignItems="center" gap={6}>
                                <ProofIcon name="check" size={14} strokeWidth={3.4} color={theme.successText?.val as string} />
                                <Body flexShrink={1} fontSize={14} lineHeight={18} fontWeight="700" tone="success" numberOfLines={2} testID="proof-method">
                                    {t('proof.signature.signed')}
                                </Body>
                            </XStack>
                        ) : null}
                    </XStack>
                )}

                {mainAction(60)}

                {card ? (
                    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: bottom + 60 + 12 }}>
                        {card}
                    </View>
                ) : null}
            </View>
        );
    };

    /* -- On its side (SignatureB, 844 by 390). ----------------------------------- */

    const wideLayout = () => {
        /*
         * The safe areas. With the screen turned by the phone, they are the
         * window's own. With the layout turned inside an upright window, they
         * are the upright ones a quarter turn round: the camera cut-out is at
         * this layout's left end, the home indicator at its right end. The
         * mockup keeps 48 clear at each short end either way.
         */
        const start = sideways ? Math.max(48, stripShowing ? insets.top + SHELL_STRIP_OFFSET + SHELL_STRIP_ROOM : insets.top) : Math.max(48, insets.left);
        const end = sideways ? Math.max(48, insets.bottom + 14) : Math.max(48, insets.right);
        const top = sideways ? Math.max(10, insets.right) : Math.max(10, insets.top);
        const bottom = sideways ? Math.max(14, insets.left) : Math.max(14, insets.bottom);
        const length = sideways ? screenHeight : screenWidth;
        const room = length - start - end;
        // The mockup's 190 and 230, on a phone long enough for them.
        const clearWidth = room >= 640 ? 190 : 140;
        const doneWidth = room >= 640 ? 230 : 190;
        return (
            <View style={{ flex: 1, paddingLeft: start, paddingRight: end, paddingTop: top, paddingBottom: bottom, gap: 10 }} testID="proof-signature">
                {/* Top: close, and the summary as one line. */}
                <XStack alignItems="center" gap={10} minHeight={48}>
                    <RoundButton icon="close" label={t('proof.signature.close')} onPress={close} testID="proof-cancel" />
                    <XStack flex={1} minWidth={0} minHeight={48} alignItems="center" gap={10} paddingHorizontal={18} borderRadius={24} backgroundColor="$surface" borderWidth={1} borderColor="$border" accessible accessibilityLabel={summaryLabel} testID="proof-activity">
                        {placeName ? (
                            <Body flexShrink={1} fontSize={16} lineHeight={21} fontWeight="800" numberOfLines={1}>
                                {placeName}
                            </Body>
                        ) : null}
                        {placeName && itemsText ? (
                            <Body fontSize={16} lineHeight={21} fontWeight="800" tone="muted">
                                ·
                            </Body>
                        ) : null}
                        {itemsText ? (
                            <Body flexShrink={0} fontSize={16} lineHeight={21} fontWeight="700" tabular numberOfLines={1}>
                                {itemsText}
                            </Body>
                        ) : null}
                        {orderNumber && (placeName || itemsText) ? (
                            <Body fontSize={16} lineHeight={21} fontWeight="800" tone="muted">
                                ·
                            </Body>
                        ) : null}
                        {orderNumber ? (
                            <Body flexShrink={0} fontFamily="$mono" fontSize={15} lineHeight={20} fontWeight="600" tone="secondary">
                                {orderNumber}
                            </Body>
                        ) : null}
                        {!placeName && !itemsText && !orderNumber ? (
                            <Body flexShrink={1} fontSize={16} lineHeight={21} fontWeight="800" numberOfLines={1}>
                                {activityLabel}
                            </Body>
                        ) : null}
                        <View style={{ flex: 1 }} />
                        {hasInk && signedAt ? (
                            <Body flexShrink={0} fontSize={14} lineHeight={18} fontWeight="700" tabular tone="secondary" numberOfLines={1}>
                                {signedAt}
                            </Body>
                        ) : null}
                    </XStack>
                    {/* Only when the layout was turned by the button: a phone that turned its own screen is simply turned back. */}
                    {sideways && !locked ? <QuietPill icon="upright" label={t('proof.signature.turnBack')} hint={t('proof.signature.turnBackLabel')} onPress={() => setTurned(false)} testID="proof-signature-upright" /> : null}
                </XStack>

                {/* The shell's strip about signal floats under the top edge when the phone turned its own screen. */}
                {stripShowing && !sideways ? <View style={{ height: SHELL_STRIP_ROOM - 10 }} /> : null}

                {signingPad('wide')}

                {/* Bottom: Clear on the left, Done on the right, both large. */}
                <XStack alignItems="center" gap={12} height={56}>
                    <LargeButton kind="secondary" label={t('proof.clear')} icon="retry" height={56} width={clearWidth} dim={!hasInk || locked} onPress={clear} testID="proof-signature-clear" />
                    <YStack flex={1} minWidth={0} alignItems="center" justifyContent="center">
                        {tooSmall ? (
                            <TooSmallNotice label={t('proof.signature.tooSmall')} testID="proof-signature-too-small" />
                        ) : (
                            <Body fontSize={14} lineHeight={18} fontWeight="700" tone="secondary" center numberOfLines={2} testID="proof-method">
                                {sending ? t('proof.signature.sending') : leaving ? '' : t('proof.signature.wideHint')}
                            </Body>
                        )}
                    </YStack>
                    {mainAction(56, doneWidth)}
                </XStack>

                {card ? (
                    <View pointerEvents="box-none" style={{ position: 'absolute', left: start, right: end, bottom: bottom + 56 + 10 + 8, alignItems: 'center' }}>
                        <View style={{ width: '100%', maxWidth: 460 }}>{card}</View>
                    </View>
                ) : null}
            </View>
        );
    };

    return (
        <View onLayout={onRootLayout} style={{ flex: 1, backgroundColor: background, overflow: 'hidden' }} testID="proof-capture">
            {/* Turned inside an upright window, the clock and the battery would lie on their side across the layout's end. */}
            {sideways ? <StatusBar hidden /> : null}
            {sideways ? (
                /*
                 * The wide layout, in a box the size of the screen on its side,
                 * turned a quarter turn clockwise about its centre: the box's top
                 * edge lies along the screen's right edge, so a phone turned
                 * anticlockwise (its top to the left) shows it the right way up.
                 */
                <View
                    style={{
                        position: 'absolute',
                        width: screenHeight,
                        height: screenWidth,
                        left: (screenWidth - screenHeight) / 2,
                        top: (screenHeight - screenWidth) / 2,
                        transform: [{ rotate: '90deg' }],
                    }}
                >
                    {wideLayout()}
                </View>
            ) : wide ? (
                wideLayout()
            ) : (
                uprightLayout()
            )}
        </View>
    );
}

export default ProofSignature;
