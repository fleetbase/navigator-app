/**
 * Proof of delivery capture — R1 s08/s19, the dynamic half.
 *
 * The design draws a fixed ARRIVE → SCAN → PHOTO → SIGN → DONE sequence. Real
 * flows do not work that way: each activity in an order config declares its own
 * `require_pod` and `pod_method`, so what a driver is asked for depends on the
 * step they are advancing into, and a config may ask for nothing at all. This
 * renders the method the config named, and nothing else.
 *
 * The camera-backed methods live in the ported v2 components so
 * `react-native-vision-camera` keeps a single owner. The signature pad is a
 * WebView canvas, which is the only one of the three that works in a simulator
 * — worth knowing when reading any verification claim about this screen.
 *
 * Capture happens **before** the activity update, never after, so a driver is
 * never left holding an order marked delivered with no proof attached to it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScrollView } from '../ui/Scroll';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Surface } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Banner';
import { ScannerOverlay, ScanChecklistRow, type ScanFeedback } from '../ui/Scanner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useScreenStyle } from '../ui/useScreenStyle';
import { useProofCapture, proofMethodOf, type ProofMethod, type ProofOutcome, type ScanFailure } from '../data/useProofCapture';
import { recordProof } from '../data/proofLedger';
import { recordItemScan } from '../data/useItemScans';
import { useOrder } from '../data/useOrders';
import { payloadOf, trackingNumberOf } from '../data/accessors';
import { matchScan, parseScanCode, scanIdentityOf, scanItemsOf, scanLabelOf, scanSubjectOf, scanTextOf } from '../data/scanCode';
import type { CapturedPhoto } from '../../components/CameraCapture';
import { formatClock } from '../format';

/*
 * The capture dependencies are loaded only when a config actually asks for
 * them. VisionCamera initialises its native module at import time and the
 * signature pad drags in a WebView, so importing them at module scope makes
 * every screen that merely *routes* to this one — the whole navigator —
 * depend on three native binaries. A driver whose flow needs no proof should
 * not pay for a camera, and a test of the tab bar should not need one either.
 */
const lazyScanner = () =>
    require('../../components/QrCodeScanner').QrCodeScanner as React.ComponentType<{ onScan: (code: string | { value?: string }) => void; frame?: boolean; scanCooldown?: number }>;
const lazyCamera = () => require('../../components/CameraCapture').default as React.ComponentType<{ onDone?: (photos: CapturedPhoto[]) => void }>;
const lazySignaturePad = () => require('react-native-signature-canvas').default as React.ComponentType<Record<string, unknown>>;

/*
 * One scanned item, held on this screen until the driver leaves it.
 *
 *   ready    read by the camera, not sent yet
 *   sent     the server took it and made a proof
 *   queued   no signal: kept by the app, sent when there is some
 *   unsent   sending failed for a reason that may pass; sent again on the next try
 *   refused  the server read the code and would not take it; not counted
 */
type HeldStatus = 'ready' | 'sent' | 'queued' | 'unsent' | 'refused';

interface HeldScan {
    /** Exactly what the camera read: what is sent. */
    code: string;
    /** The item's tracking number: what is shown. */
    label: string;
    at: string;
    /** The item the scan is sent under, when the phone knows its id. */
    subjectId?: string;
    status: HeldStatus;
    proofId?: string;
}

interface ScanProblem {
    label: string;
    failure: ScanFailure;
    message?: string;
}

/** Refusals that sending again will not change. */
const FINAL_FAILURES: ScanFailure[] = ['mismatch', 'notOnOrder', 'unreadable'];
/** Failures that will meet every other scan too: no point sending the rest now. */
const STOPPING_FAILURES: ScanFailure[] = ['noSignal', 'orderMissing'];

/** One array for "no list", so the items are not rebuilt on every render. */
const NO_EXPECTED: string[] = [];

export interface ProofCaptureScreenProps {
    orderId: string;
    /** The activity being advanced into — it is the one demanding proof. */
    activityCode: string;
    activityLabel: string;
    podMethod?: string | null;
    /** Tracking numbers the scan is checked against, when the order has them. */
    expected?: string[];
    /** Proof for one entity rather than the whole order. */
    subjectId?: string;
    onCaptured?: (outcome: ProofOutcome) => void;
    onCancel?: () => void;
}

export function ProofCaptureScreen({
    orderId,
    activityCode,
    activityLabel,
    podMethod,
    expected = NO_EXPECTED,
    subjectId,
    onCaptured,
    onCancel,
}: ProofCaptureScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const method: ProofMethod = proofMethodOf(podMethod);
    const { capture, sendScan, isCapturing, error, lastProofId } = useProofCapture(orderId);
    const order = useOrder(orderId || undefined);

    const [photos, setPhotos] = useState<string[]>([]);
    const signatureRef = useRef<{ readSignature: () => void } | null>(null);

    /*
     * The items a scan is checked against. A label carries its item twice, as a
     * barcode (the tracking number) and as a QR code (the tracking page's
     * address, naming the number and the item's id), so a read is matched to an
     * item rather than compared as text: either code ticks the item, and both
     * together are still one scan. The order's own copy of its items adds the
     * ids, where it has them.
     */
    const orderEntities = payloadOf(order).entities;
    const items = useMemo(() => scanItemsOf(expected, orderEntities ?? []), [expected, orderEntities]);
    const orderNumber = trackingNumberOf(order);

    // Scans by item (or, with no list to check against, by what the code names).
    const [scans, setScans] = useState<Record<string, HeldScan>>({});
    const scansRef = useRef(scans);
    const commit = useCallback((next: Record<string, HeldScan>) => {
        scansRef.current = next;
        setScans(next);
    }, []);
    const [last, setLast] = useState<{ feedback: ScanFeedback; label?: string; note?: string }>({ feedback: 'idle' });
    const [problem, setProblem] = useState<ScanProblem | null>(null);
    const [sending, setSending] = useState(false);
    const sendingRef = useRef(false);
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    const send = useCallback(
        async (payload: Parameters<typeof capture>[0]) => {
            const outcome = await capture(payload, subjectId);
            if (outcome === 'failed') return;
            /*
             * Recorded against the activity it was captured for, so the order
             * screen advances on return instead of opening this screen again.
             * Whole-order proof only — a per-item capture does not satisfy the
             * activity.
             */
            if (!subjectId) recordProof(orderId, activityCode, { proofId: lastProofId(), queued: outcome === 'queued' });
            onCaptured?.(outcome);
        },
        [capture, onCaptured, subjectId, orderId, activityCode, lastProofId]
    );

    const onScan = useCallback(
        (result: string | { value?: string } | null | undefined) => {
            // The camera hands over an object (`{ value, type }`); the text is what is read.
            const text = scanTextOf(result);
            if (!text || sendingRef.current) return;
            const code = parseScanCode(text);

            let key: string;
            let item: (typeof items)[number] | undefined;
            if (items.length) {
                const index = matchScan(code, items);
                if (index < 0) {
                    /*
                     * Not on the list: said, and not counted. The order's own
                     * label gets its own words, since it is a real label of
                     * this job and "not one of this order's items" would read
                     * as a fault.
                     */
                    const isOrderLabel =
                        !!order &&
                        ((!!code.trackingNumber && !!orderNumber && code.trackingNumber.toLowerCase() === orderNumber.toLowerCase() && !(code.publicId ?? '').startsWith('entity_')) ||
                            (!!code.publicId && code.publicId === order.id));
                    setLast({ feedback: 'unexpected', label: scanLabelOf(code), note: t(isOrderLabel ? 'proof.scan.orderLabel' : 'proof.scan.notAnItem') });
                    return;
                }
                item = items[index];
                key = item.key;
            } else {
                key = scanIdentityOf(code);
            }

            const label = scanLabelOf(code, item);
            if (!label) {
                // An address that names neither a tracking number nor a record: nothing to send.
                setLast({ feedback: 'unexpected', note: t('proof.scan.unreadable') });
                return;
            }

            const held = scansRef.current[key];
            if (held && held.status !== 'refused') {
                // The same item again (its other code, or the same one): one scan, not two.
                setLast({ feedback: 'duplicate', label: held.label, note: t('proof.scan.duplicate') });
                return;
            }

            commit({ ...scansRef.current, [key]: { code: text, label, at: new Date().toISOString(), subjectId: scanSubjectOf(code, item), status: 'ready' } });
            setLast({ feedback: 'accepted', label, note: t('proof.scan.accepted') });
        },
        [items, order, orderNumber, commit, t]
    );

    /** Leaves with what the server took (or the app is keeping to send). */
    const finishScans = useCallback(() => {
        const good = Object.values(scansRef.current).filter((scan) => scan.status === 'sent' || scan.status === 'queued');
        if (!good.length) return;
        /*
         * The activity needs one proof to go through, and is sent its id. Each
         * item's scan is its own proof, filed under the item; the last one the
         * server made stands for the step. With none yet (all waiting for
         * signal) the proof is recorded as queued.
         */
        const proofId = [...good].reverse().find((scan) => scan.proofId)?.proofId;
        if (!subjectId) recordProof(orderId, activityCode, { proofId, queued: !proofId });
        onCaptured?.(proofId ? 'sent' : 'queued');
    }, [subjectId, orderId, activityCode, onCaptured]);

    const sendScans = useCallback(async () => {
        if (sendingRef.current) return;
        sendingRef.current = true;
        setSending(true);
        setProblem(null);
        let firstProblem: ScanProblem | null = null;
        for (const key of Object.keys(scansRef.current)) {
            const scan = scansRef.current[key];
            if (scan.status !== 'ready' && scan.status !== 'unsent') continue;
            const result = await sendScan(scan.code, scan.subjectId ?? subjectId);
            if (result.outcome === 'failed') {
                const failure = result.failure ?? 'other';
                commit({ ...scansRef.current, [key]: { ...scan, status: FINAL_FAILURES.includes(failure) ? 'refused' : 'unsent' } });
                firstProblem = firstProblem ?? { label: scan.label, failure, message: result.message };
                if (STOPPING_FAILURES.includes(failure)) break;
                continue;
            }
            commit({ ...scansRef.current, [key]: { ...scan, status: result.outcome === 'queued' ? 'queued' : 'sent', proofId: result.proofId } });
            // The item's own screen reads this, so it shows as scanned there too.
            if (result.subjectId && result.subjectId.startsWith('entity_')) {
                recordItemScan(orderId, result.subjectId, { queued: result.outcome === 'queued', proofId: result.proofId });
            }
        }
        sendingRef.current = false;
        if (!alive.current) return;
        setSending(false);
        if (firstProblem) {
            // Stays here, with every scan still on screen, so the driver can read why.
            setProblem(firstProblem);
            return;
        }
        finishScans();
    }, [sendScan, subjectId, orderId, commit, finishScans]);

    const held = Object.values(scans);
    const countedScans = held.filter((scan) => scan.status !== 'refused').length;
    const pendingScans = held.filter((scan) => scan.status === 'ready' || scan.status === 'unsent').length;
    const takenScans = held.filter((scan) => scan.status === 'sent' || scan.status === 'queued').length;

    const problemText = problem
        ? problem.failure === 'other'
            ? problem.message
                ? t('proof.scan.failure.other', { code: problem.label, reason: problem.message })
                : t('proof.scan.failure.otherUnknown', { code: problem.label })
            : t(`proof.scan.failure.${problem.failure}`, { code: problem.label })
        : null;

    const checklistRow = (key: string, name: string, number: string) => {
        const scan = scans[key];
        return (
            <ScanChecklistRow
                key={key}
                name={name}
                code={number}
                scannedAt={scan && scan.status !== 'refused' ? formatClock(scan.at) : undefined}
                problem={scan?.status === 'refused' ? t('proof.scan.notAccepted') : scan?.status === 'unsent' ? t('proof.scan.notSent') : undefined}
                note={scan?.status === 'queued' ? t('proof.scan.waiting') : undefined}
            />
        );
    };

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="proof-capture">
            <YStack gap={space[1]}>
                <Caption>{t('proof.forActivity')}</Caption>
                <Body fontSize={17} fontWeight="800" testID="proof-activity">
                    {activityLabel}
                </Body>
                <Micro testID="proof-method">{t(`proof.method.${method}`)}</Micro>
            </YStack>

            {problemText ? (
                // Why, in the server's terms, and that nothing scanned is lost.
                <Banner tone="danger" message={pendingScans ? `${problemText} ${t('proof.scan.kept')}` : problemText} testID="proof-error" />
            ) : error ? (
                <Banner tone="danger" message={t('proof.failed')} testID="proof-error" />
            ) : null}

            {method === 'scan' ? (
                <YStack gap={space[3]} testID="proof-scan">
                    {/* The overlay's copy is white: it belongs on the feed, per its own contract. */}
                    <View style={{ height: 360, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' }}>
                        <View style={StyleSheet.absoluteFill}>
                            {/* `frame={false}`: the overlay below draws the one scan frame. */}
                            {(() => { const Scanner = lazyScanner(); return <Scanner onScan={onScan} frame={false} scanCooldown={1500} />; })()}
                        </View>
                        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                            <ScannerOverlay scanned={countedScans} expected={items.length} lastCode={last.label} note={last.note} feedback={last.feedback} hint={t('proof.scan.hint')} />
                        </View>
                    </View>
                    {items.length || held.length ? (
                        <Surface testID="proof-checklist">
                            {items.length
                                ? items.map((item) => checklistRow(item.key, item.name ?? item.trackingNumber ?? item.key, item.trackingNumber ?? item.key))
                                : Object.keys(scans).map((key) => checklistRow(key, scans[key].label, scans[key].label))}
                        </Surface>
                    ) : null}
                    <Button
                        fullWidth
                        disabled={(!pendingScans && !takenScans) || sending}
                        loading={sending}
                        // Nothing left to send but some were taken: the step can go on with those.
                        onPress={() => (pendingScans ? void sendScans() : finishScans())}
                        testID="proof-submit-scan"
                    >
                        {pendingScans || !takenScans ? t('proof.submitScan', { count: pendingScans }) : t('proof.scan.continue')}
                    </Button>
                </YStack>
            ) : null}

            {method === 'photo' ? (
                <YStack gap={space[3]} testID="proof-photo">
                    <View style={{ height: 380 }}>
                        {(() => {
                            const Camera = lazyCamera();
                            return <Camera
                            onDone={(taken: CapturedPhoto[]) => {
                                // The endpoint accepts base64; a file path would
                                // have to be re-read at replay time, by which
                                // point the app may have been restarted.
                                setPhotos(taken.map((p) => p.base64 ?? '').filter(Boolean));
                            }}
                        />; })()}
                    </View>
                    <Secondary testID="proof-photo-count">{t('proof.photoCount', { count: photos.length })}</Secondary>
                    <Button
                        fullWidth
                        disabled={!photos.length || isCapturing}
                        loading={isCapturing}
                        onPress={() => send({ method: 'photo', photos })}
                        testID="proof-submit-photo"
                    >
                        {t('proof.submitPhoto')}
                    </Button>
                </YStack>
            ) : null}

            {method === 'signature' ? (
                <YStack gap={space[3]} testID="proof-signature">
                    <View style={{ height: 300 }}>
                        {(() => {
                            const SignaturePad = lazySignaturePad();
                            return <SignaturePad
                            ref={signatureRef as never}
                            onOK={(signature: string) => send({ method: 'signature', signature, remarks: activityCode })}
                            descriptionText={t('proof.signHere')}
                            clearText={t('proof.clear')}
                            confirmText={t('proof.confirm')}
                            webStyle=".m-signature-pad--footer { display: none; }"
                        />; })()}
                    </View>
                    <XStack gap={space[2]}>
                        <Button flex={1} variant="ghost" onPress={() => onCancel?.()} testID="proof-cancel">
                            {t('common.cancel')}
                        </Button>
                        <Button
                            flex={1}
                            loading={isCapturing}
                            // The pad answers through onOK rather than returning
                            // a value, so this asks it to read itself.
                            onPress={() => signatureRef.current?.readSignature()}
                            testID="proof-submit-signature"
                        >
                            {t('proof.submitSignature')}
                        </Button>
                    </XStack>
                </YStack>
            ) : null}
        </ScrollView>
    );
}

export default ProofCaptureScreen;
