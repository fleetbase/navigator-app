/**
 * Proof by scanning: "camera first" (design round 3, ProofScanA and its states).
 *
 * The camera is the screen. Over it: one scan frame, a pill that counts, a
 * close button and the torch. What a read came to rises from the bottom, where
 * the thumb is and the eye lands after looking at a label: large and green
 * naming the item, amber for one already scanned, red for one that is not on
 * the order. The list of items is a drawer under all of it, pulled up when
 * wanted. The one button, "Complete step", is there only when every item is
 * scanned.
 *
 * What a scan *is* has not changed, only how it is shown:
 *
 *   - scans are held per item; a label's barcode and its QR code are one item
 *     (data/scanCode is the parser and the matcher, here as on the server);
 *   - a re-read is "Already scanned" and not a second scan; a code that matches
 *     no item is said and not counted;
 *   - a typed code goes through the same function as a camera read;
 *   - scans are sent one request per item (`sendScan`), a refusal is told apart
 *     from a scan that merely could not be sent, and the proof ledger records
 *     what the order screen then uses to complete the step.
 *
 * New here: the held scans are also kept on the phone (data/heldScans), so
 * closing the screen and coming back does not lose them.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { AccessibilityInfo, StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Secondary } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { ScanChecklistRow, ScanFrame, onCamera } from '../../ui/Scanner';
import { haptic } from '../../ui/haptics';
import { useTranslation } from '../../i18n/useTranslation';
import { useProofCapture, type ProofOutcome, type ScanFailure } from '../../data/useProofCapture';
import { recordProof } from '../../data/proofLedger';
import { recordItemScan } from '../../data/useItemScans';
import { clearHeldScans, heldScansFor, keepHeldScans, type HeldScan } from '../../data/heldScans';
import { useOrder } from '../../data/useOrders';
import { payloadOf, trackingNumberOf } from '../../data/accessors';
import { matchScan, parseScanCode, scanIdentityOf, scanItemsOf, scanLabelOf, scanSubjectOf, scanTextOf, type ScanItem } from '../../data/scanCode';
import { formatClock } from '../../format';
import { CameraProblem, DrawerHandleRow, GlassAction, GlassButton, GlassLine, MessageCard, PrimaryAction, ProgressPill, Rise, ScannedCard, ScannedStrip, TypeCodeSheet, type MessageLine } from './parts';

type CameraState = 'ready' | 'denied' | 'unavailable';

/*
 * Loaded only when this screen is: VisionCamera initialises its native module
 * at import time, and a driver whose flow needs no scan should not pay for a
 * camera (see ProofCaptureScreen).
 */
const lazyScanner = () =>
    require('../../../components/QrCodeScanner').QrCodeScanner as ComponentType<{
        onScan: (code: string | { value?: string }) => void;
        frame?: boolean;
        scanCooldown?: number;
        torch?: boolean;
        onTorchAvailable?: (available: boolean) => void;
        onCameraState?: (state: CameraState) => void;
    }>;

interface ScanProblem {
    label: string;
    failure: ScanFailure;
    message?: string;
}

/** What the last read came to, shown where the confirmation sits. */
type Notice = { id: number } & (
    | { kind: 'accepted'; name?: string; code: string; time: string }
    | { kind: 'duplicate'; name?: string; code: string; time: string }
    | { kind: 'unexpected'; reason: 'notAnItem' | 'orderLabel' | 'unreadable'; code?: string }
);
type WithoutId<N> = N extends { id: number } ? Omit<N, 'id'> : never;
type NoticeBody = WithoutId<Notice>;

/** Refusals that sending again will not change. */
const FINAL_FAILURES: ScanFailure[] = ['mismatch', 'notOnOrder', 'unreadable'];
/** Failures that will meet every other scan too: no point sending the rest now. */
const STOPPING_FAILURES: ScanFailure[] = ['noSignal', 'orderMissing'];

/** The confirmation stays large this long, then settles into its strip. */
const SETTLE_MS = 2000;
/** An amber or red message stays this long after the last time its code was read. */
const MESSAGE_MS = 6000;
/** The same code giving the same answer inside this is one message, not a new one each time the camera sees it. */
const REPEAT_MS = 4000;
/** A label still in front of the camera just after it was accepted is not "already scanned". */
const GRACE_MS = 4000;
/** "Saved on this phone" is shown this long before going back to the order by itself. */
const SAVED_MS = 4000;

const FRAME_WIDTH = 300;
const FRAME_HEIGHT = 190;
const FRAME_RADIUS = 22;
/** The dimming is one very thick border round the frame, so its inner corners are the frame's. */
const DIM = 1600;

export interface ProofScanProps {
    orderId: string;
    /** The activity being advanced into: it is the one asking for the scans. */
    activityCode: string;
    activityLabel: string;
    /** Tracking numbers the scans are checked against, when the order has them. */
    expected: string[];
    /** Proof for one entity rather than the whole order. */
    subjectId?: string;
    /** The shell's strip about signal and syncing is floating under the top row: leave that line to it. */
    stripShowing?: boolean;
    onCaptured?: (outcome: ProofOutcome) => void;
    onCancel?: () => void;
}

export function ProofScan({ orderId, activityCode, activityLabel, expected, subjectId, stripShowing, onCaptured, onCancel }: ProofScanProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const { sendScan } = useProofCapture(orderId);
    const order = useOrder(orderId || undefined);
    const Scanner = useMemo(() => lazyScanner(), []);

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
    // They start from what was kept on the phone for this step, if the driver has been here before.
    const [scans, setScans] = useState<Record<string, HeldScan>>(() => {
        const kept = heldScansFor(orderId, activityCode, subjectId);
        if (!items.length) return kept;
        const wanted: Record<string, HeldScan> = {};
        for (const item of items) if (kept[item.key]) wanted[item.key] = kept[item.key];
        return wanted;
    });
    const scansRef = useRef(scans);
    const commit = useCallback(
        (next: Record<string, HeldScan>) => {
            scansRef.current = next;
            setScans(next);
            keepHeldScans(orderId, activityCode, next, subjectId);
        },
        [orderId, activityCode, subjectId]
    );

    const [notice, setNotice] = useState<Notice | null>(null);
    /** The last item accepted: what the confirmation settles into. */
    const [lastAccepted, setLastAccepted] = useState<{ key: string; name?: string; code: string; time: string } | null>(null);
    const [problem, setProblem] = useState<ScanProblem | null>(null);
    const [sending, setSending] = useState(false);
    /** How many scans are waiting for signal, once sending came to that: the calm "saved on this phone" state. */
    const [saved, setSaved] = useState(0);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [typing, setTyping] = useState(false);
    const [torch, setTorch] = useState(false);
    const [torchAvailable, setTorchAvailable] = useState(false);
    const [camera, setCamera] = useState<CameraState | null>(null);

    const sendingRef = useRef(false);
    const alive = useRef(true);
    const noticeId = useRef(0);
    const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSaid = useRef<{ signature: string; at: number } | null>(null);
    const justAccepted = useRef<{ key: string; at: number } | null>(null);
    /** The outcome to leave with once "saved on this phone" has been shown. */
    const leavingWith = useRef<ProofOutcome | null>(null);
    const left = useRef(false);
    const sheetRef = useRef<BottomSheet>(null);

    /*
     * The camera keeps reading while something else has the driver's attention.
     * Those reads are let go: an answer would rise behind the open list or the
     * typing sheet, or replace a message that is waiting to be read.
     */
    const cameraPaused = useRef(false);
    cameraPaused.current = drawerOpen || typing || saved > 0 || !!problem;

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            if (noticeTimer.current) clearTimeout(noticeTimer.current);
            if (savedTimer.current) clearTimeout(savedTimer.current);
        };
    }, []);

    /** Shows what a read came to, with its tap in the hand. The same answer to the same code is not said twice in a row. */
    const say = useCallback((body: NoticeBody, signature: string, spoken: string) => {
        const now = Date.now();
        const repeated = !!lastSaid.current && lastSaid.current.signature === signature && now - lastSaid.current.at < REPEAT_MS;
        lastSaid.current = { signature, at: now };
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), body.kind === 'accepted' ? SETTLE_MS : MESSAGE_MS);
        if (repeated) return;
        noticeId.current += 1;
        setNotice({ ...body, id: noticeId.current } as Notice);
        haptic(body.kind === 'accepted' ? 'success' : 'rejected');
        AccessibilityInfo.announceForAccessibility(spoken);
    }, []);

    /**
     * One read, from the camera or typed by hand: the same parser, the same
     * matching and the same answers either way.
     */
    const onRead = useCallback(
        (result: string | { value?: string } | null | undefined, typed = false) => {
            // The camera hands over an object (`{ value, type }`); the text is what is read.
            const text = scanTextOf(result);
            if (!text || sendingRef.current) return;
            // The proof is already recorded and the screen is on its way back to the order.
            if (leavingWith.current || left.current) return;
            if (!typed && cameraPaused.current) return;
            // A typed code is the driver moving on from whatever message was on screen.
            if (typed) setProblem(null);
            const code = parseScanCode(text);

            let key: string;
            let item: ScanItem | undefined;
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
                    const reason = isOrderLabel ? 'orderLabel' : 'notAnItem';
                    // What was read is shown as its tracking number, or its text: never an address.
                    say({ kind: 'unexpected', reason, code: scanLabelOf(code) }, `${reason}:${text}`, t(isOrderLabel ? 'proof.scan.orderLabel' : 'proof.scan.notAnItem'));
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
                say({ kind: 'unexpected', reason: 'unreadable' }, `unreadable:${text}`, t('proof.scan.unreadable'));
                return;
            }

            const held = scansRef.current[key];
            if (held && held.status !== 'refused') {
                /*
                 * The same item again (its other code, or the same one): one
                 * scan, not two. Said, except while the label is still in front
                 * of the camera straight after being accepted, which is the
                 * camera reading on and not the driver scanning twice.
                 */
                const fresh = justAccepted.current;
                if (!typed && fresh && fresh.key === key && Date.now() - fresh.at < GRACE_MS) {
                    fresh.at = Date.now();
                    return;
                }
                say({ kind: 'duplicate', name: item?.name, code: held.label, time: formatClock(held.at) }, `duplicate:${key}`, t('proof.scan.duplicate'));
                return;
            }

            const at = new Date().toISOString();
            commit({ ...scansRef.current, [key]: { code: text, label, at, subjectId: scanSubjectOf(code, item), status: 'ready' } });
            justAccepted.current = { key, at: Date.now() };
            setLastAccepted({ key, name: item?.name, code: label, time: formatClock(at) });
            say({ kind: 'accepted', name: item?.name, code: label, time: formatClock(at) }, `accepted:${key}:${at}`, `${t('proof.scan.accepted')}. ${item?.name ?? label}`);
        },
        [items, order, orderNumber, commit, say, t]
    );

    /**
     * Records the proof for the step from what the server took (or the app is
     * keeping to send). Says what to leave with, or nothing when no scan stands.
     */
    const recordScans = useCallback((): ProofOutcome | null => {
        const good = Object.values(scansRef.current).filter((scan) => scan.status === 'sent' || scan.status === 'queued');
        if (!good.length) return null;
        /*
         * The activity needs one proof to go through, and is sent its id. Each
         * item's scan is its own proof, filed under the item; the last one the
         * server made stands for the step. With none yet (all waiting for
         * signal) the proof is recorded as queued.
         */
        const proofId = [...good].reverse().find((scan) => scan.proofId)?.proofId;
        if (!subjectId) recordProof(orderId, activityCode, { proofId, queued: !proofId });
        // Spent: the step goes through on these, and the screen will not be asked for again.
        clearHeldScans(orderId, activityCode, subjectId);
        return proofId ? 'sent' : 'queued';
    }, [subjectId, orderId, activityCode]);

    /** Back to the order, once. */
    const leave = useCallback(
        (outcome: ProofOutcome) => {
            if (left.current) return;
            left.current = true;
            if (savedTimer.current) clearTimeout(savedTimer.current);
            onCaptured?.(outcome);
        },
        [onCaptured]
    );

    /** Leaves with what the server took (or the app is keeping to send). */
    const finishScans = useCallback(() => {
        if (leavingWith.current) {
            leave(leavingWith.current);
            return;
        }
        const outcome = recordScans();
        if (outcome) leave(outcome);
    }, [recordScans, leave]);

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
            setNotice(null);
            haptic('rejected');
            return;
        }
        /*
         * No signal: the app is keeping some of them to send. The proof is
         * recorded now, exactly as it would be on leaving; the driver is told,
         * calmly, and taken back to the order a moment later (or at a tap).
         */
        const waiting = Object.values(scansRef.current).filter((scan) => scan.status === 'queued').length;
        if (waiting) {
            const outcome = recordScans();
            if (!outcome) return;
            leavingWith.current = outcome;
            setNotice(null);
            setSaved(waiting);
            savedTimer.current = setTimeout(() => leave(outcome), SAVED_MS);
            return;
        }
        finishScans();
    }, [sendScan, subjectId, orderId, commit, finishScans, recordScans, leave]);

    /* -- What there is to show. ------------------------------------------------ */

    const heldList = Object.values(scans);
    const countedScans = heldList.filter((scan) => scan.status !== 'refused').length;
    const pendingScans = heldList.filter((scan) => scan.status === 'ready' || scan.status === 'unsent').length;
    const takenScans = heldList.filter((scan) => scan.status === 'sent' || scan.status === 'queued').length;

    const total = items.length;
    const isScanned = (item: ScanItem) => !!scans[item.key] && scans[item.key].status !== 'refused';
    const remaining = items.filter((item) => !isScanned(item));
    const allScanned = total > 0 && remaining.length === 0;
    const scannedOfList = total - remaining.length;

    /*
     * The rules, in one place:
     *
     *   - anything can be sent once at least one scan stands (as before);
     *   - the camera view offers its one button only when there is nothing left
     *     to scan: every item of the list, or, with no list to count against,
     *     as soon as one code is scanned;
     *   - with only some items scanned, the same send is in the drawer, quieter;
     *   - when nothing is left to send but the server has taken some, the button
     *     goes on with those.
     */
    const canSend = pendingScans > 0 || takenScans > 0;
    const complete = total > 0 ? allScanned : countedScans > 0;
    const act = () => (pendingScans ? void sendScans() : finishScans());
    const actLabel = total > 0 && allScanned ? t('proof.scan.complete') : pendingScans || !takenScans ? (total > 0 ? t('proof.scan.sendSome', { scanned: countedScans, total }) : t('proof.submitScan', { count: pendingScans })) : t('proof.scan.continue');

    const cameraUnusable = camera === 'denied' || camera === 'unavailable';

    /* -- Layout, from the mockup's 390 by 844. ----------------------------------- */

    const top = Math.max(insets.top, 16) + 1;
    const compact = height < 720;
    const frameWidth = Math.min(compact ? 260 : FRAME_WIDTH, width - 90);
    const frameHeight = Math.round((frameWidth * FRAME_HEIGHT) / FRAME_WIDTH);
    const frameLeft = Math.round((width - frameWidth) / 2);
    const frameTop = top + (compact ? 104 : 128);
    const fadeHeight = top + 122;

    // The drawer at rest: its grip, its 48dp row and room for the home indicator (96 on the mockup).
    const collapsedHeight = 67 + Math.max(insets.bottom - 5, 16);
    const rowCount = total || Object.keys(scans).length;
    const drawerActionShown = canSend && !saved;
    const expandedHeight = Math.max(collapsedHeight + 140, Math.min(Math.round(height * 0.72), 67 + 8 + (rowCount ? rowCount * 66 : 56) + (drawerActionShown ? 72 : 0) + Math.max(insets.bottom, 16)));
    const snapPoints = useMemo(() => [collapsedHeight, expandedHeight], [collapsedHeight, expandedHeight]);

    const toggleDrawer = () => sheetRef.current?.snapToIndex(drawerOpen ? 0 : 1);
    const openTyping = () => {
        if (drawerOpen) sheetRef.current?.snapToIndex(0);
        setTyping(true);
    };

    /* -- Words. ---------------------------------------------------------------- */

    const progressText = total > 0 ? t('proof.scan.progress', { scanned: scannedOfList, total }) : t('proof.scan.progressCount', { count: countedScans });
    const progressLabel = total > 0 ? t('proof.scan.progressLabel', { scanned: scannedOfList, total }) : progressText;
    const instruction = sending ? t('proof.scan.sending') : total > 0 ? (allScanned ? t('proof.scan.allDone') : t('proof.scan.left', { count: remaining.length })) : t('proof.scan.pointAny');

    const drawerTitle = total > 0 ? t('ui.itemCount', { count: total }) : t('proof.scan.drawer.codes', { count: countedScans });
    const drawerAside = saved
        ? t('proof.scan.drawer.waiting', { count: saved })
        : total === 0
          ? undefined
          : notice && notice.kind !== 'accepted'
            ? t('proof.scan.drawer.still', { scanned: scannedOfList, total })
            : allScanned
              ? t('proof.scan.drawer.allScanned')
              : remaining.length === 1 && remaining[0].name
                ? t('proof.scan.drawer.oneLeft', { name: remaining[0].name })
                : t('proof.scan.drawer.left', { count: remaining.length });
    const drawerLabel = [drawerTitle, drawerAside, t(drawerOpen ? 'proof.scan.drawer.close' : 'proof.scan.drawer.open')].filter(Boolean).join('. ');

    const problemFinal = !!problem && FINAL_FAILURES.includes(problem.failure);
    const problemLines: MessageLine[] = [];
    if (problem) {
        if (problem.failure === 'other' && problem.message) {
            // The server's own reason, as it gave it.
            problemLines.push({ text: t('proof.scan.card.serverSaid'), look: 'soft' });
            problemLines.push({ text: t('proof.scan.card.serverQuote', { reason: problem.message }), look: 'strong' });
        } else if (problem.failure === 'other') {
            problemLines.push({ text: t('proof.scan.failure.otherUnknown', { code: problem.label }), look: 'bright' });
        } else {
            problemLines.push({ text: t(`proof.scan.failure.${problem.failure}`, { code: problem.label }), look: 'bright' });
        }
        if (pendingScans) problemLines.push({ text: t('proof.scan.card.kept', { count: pendingScans }) });
    }

    const noticeCard = () => {
        if (!notice) return null;
        if (notice.kind === 'accepted') {
            return <ScannedCard caption={t('proof.scan.card.scannedAt', { time: notice.time })} name={notice.name} code={notice.code} testID="proof-scan-accepted" />;
        }
        if (notice.kind === 'duplicate') {
            return (
                <MessageCard
                    tone="warning"
                    icon="doubleCheck"
                    title={t('proof.scan.card.duplicateTitle')}
                    code={notice.code}
                    lines={[{ text: notice.name ? t('proof.scan.card.duplicateBody', { name: notice.name, time: notice.time }) : t('proof.scan.card.duplicateBodyNoName', { time: notice.time }) }]}
                    testID="proof-scan-duplicate"
                />
            );
        }
        const titleKey = notice.reason === 'orderLabel' ? 'orderLabelTitle' : notice.reason === 'unreadable' ? 'unreadableTitle' : 'notAnItemTitle';
        const bodyKey = notice.reason === 'orderLabel' ? 'orderLabelBody' : notice.reason === 'unreadable' ? 'unreadableBody' : 'notCounted';
        return (
            <MessageCard
                tone="danger"
                icon="close"
                alert
                title={t(`proof.scan.card.${titleKey}`)}
                code={notice.code ? t('proof.scan.card.readCode', { code: notice.code }) : undefined}
                lines={[{ text: t(`proof.scan.card.${bodyKey}`) }]}
                testID="proof-scan-unexpected"
            />
        );
    };

    const settledStrip = () => {
        if (allScanned) {
            const lastName = lastAccepted ? (lastAccepted.name ?? lastAccepted.code) : undefined;
            return <ScannedStrip title={t('proof.scan.card.allScanned', { count: total })} aside={lastName ? t('proof.scan.card.last', { name: lastName }) : undefined} testID="proof-scan-all" />;
        }
        if (lastAccepted && scans[lastAccepted.key] && scans[lastAccepted.key].status !== 'refused') {
            return <ScannedStrip title={lastAccepted.name ?? lastAccepted.code} mono={!lastAccepted.name} aside={t('proof.scan.row.scanned', { time: lastAccepted.time })} testID="proof-scan-last" />;
        }
        return null;
    };

    const checklistRow = (key: string, name: string, number: string, index: number) => {
        const scan = scans[key];
        return (
            <ScanChecklistRow
                key={key}
                name={name}
                code={number}
                divided={index > 0}
                scannedAt={scan && scan.status !== 'refused' ? formatClock(scan.at) : undefined}
                problem={scan?.status === 'refused' ? t('proof.scan.notAccepted') : scan?.status === 'unsent' ? t('proof.scan.notSent') : undefined}
                note={scan?.status === 'queued' ? t('proof.scan.waiting') : undefined}
            />
        );
    };

    return (
        <View style={styles.root} testID="proof-capture">
            {/* The camera is dark in every scheme, so the clock and the battery over it are light. */}
            <StatusBar barStyle="light-content" />

            {/* The camera fills the screen, under the status bar. `frame={false}`: the one scan frame is drawn below. */}
            <View style={StyleSheet.absoluteFill} testID="proof-scan">
                <Scanner onScan={onRead} frame={false} scanCooldown={1500} torch={torch} onTorchAvailable={setTorchAvailable} onCameraState={setCamera} />
            </View>

            {cameraUnusable ? null : (
                <>
                    {/* Everything outside the frame is dimmed: one thick border, so the opening has the frame's round corners. */}
                    <View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            left: frameLeft - DIM,
                            top: frameTop - DIM,
                            width: frameWidth + DIM * 2,
                            height: frameHeight + DIM * 2,
                            borderWidth: DIM,
                            borderRadius: FRAME_RADIUS + DIM,
                            borderColor: onCamera.dim,
                        }}
                    />
                    <View pointerEvents="none" style={{ position: 'absolute', left: frameLeft, top: frameTop }}>
                        <ScanFrame width={frameWidth} height={frameHeight} tone={notice ? notice.kind : 'idle'} readLabel={t('proof.scan.read')} testID="proof-scan-frame" />
                    </View>
                </>
            )}

            {/* The top fades to dark, so the status bar and the top row read over any picture. */}
            <View pointerEvents="none" style={styles.fade}>
                <Svg width={width} height={fadeHeight}>
                    <Defs>
                        <LinearGradient id="proofTopFade" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={onCamera.ground} stopOpacity={1} />
                            <Stop offset="1" stopColor={onCamera.ground} stopOpacity={0} />
                        </LinearGradient>
                    </Defs>
                    <Rect width={width} height={fadeHeight} fill="url(#proofTopFade)" />
                </Svg>
            </View>

            {/* Top: close, the progress pill, the torch. */}
            <XStack position="absolute" left={16} right={16} top={top} height={48} alignItems="center" justifyContent="space-between" gap={10} pointerEvents="box-none">
                <GlassButton icon="close" label={t('proof.scan.close')} onPress={() => (leavingWith.current ? finishScans() : onCancel?.())} testID="proof-cancel" />
                <ProgressPill scanned={scannedOfList} total={total} text={progressText} label={progressLabel} testID="proof-progress" />
                {torchAvailable && !cameraUnusable ? (
                    <GlassButton icon="torch" label={t(torch ? 'proof.scan.torchOff' : 'proof.scan.torchOn')} on={torch} onPress={() => setTorch((lit) => !lit)} testID="proof-torch" />
                ) : (
                    // Keeps the pill in the middle on a phone with no light.
                    <YStack width={48} height={48} flexShrink={0} />
                )}
            </XStack>

            {/* What this proof is for: the step's own name, and the order. */}
            {stripShowing ? null : (
                <YStack position="absolute" left={16} right={16} top={top + 60} alignItems="center" gap={2} pointerEvents="none">
                    <Body fontSize={12} lineHeight={16} fontWeight="800" letterSpacing={0.72} color={onCamera.textSoft} textTransform="uppercase" center testID="proof-activity">
                        {t('proof.scan.proofFor', { step: activityLabel })}
                    </Body>
                    {orderNumber ? (
                        <Body fontFamily="$mono" fontSize={14} lineHeight={18} fontWeight="600" color={onCamera.textSoft} center>
                            {orderNumber}
                        </Body>
                    ) : null}
                </YStack>
            )}

            {cameraUnusable ? (
                // No camera to scan with: what to do about it, and typing still open.
                <YStack position="absolute" left={0} right={0} top={frameTop}>
                    <CameraProblem denied={camera === 'denied'} onType={openTyping} testID="proof-camera-problem" />
                </YStack>
            ) : (
                // One instruction, and the way out for a damaged label.
                <YStack position="absolute" left={16} right={16} top={frameTop + frameHeight + 32} alignItems="center" gap={12} pointerEvents="box-none">
                    <GlassLine testID="proof-method">{instruction}</GlassLine>
                    {allScanned || saved ? null : <GlassAction icon="keyboard" label={t('proof.scan.typeCode')} disabled={sending} onPress={openTyping} testID="proof-type-code" />}
                </YStack>
            )}

            {/* Where the thumb is: what the last read came to, and the one button when it is the thing to do. */}
            <YStack position="absolute" left={16} right={16} bottom={collapsedHeight + 12} gap={12} pointerEvents="box-none">
                {problem ? (
                    <>
                        <Rise key="problem" from={80}>
                            <MessageCard
                                tone="danger"
                                icon="alert"
                                alert
                                title={t(problemFinal ? 'proof.scan.card.notAcceptedTitle' : 'proof.scan.card.notSentTitle')}
                                code={problem.label}
                                lines={problemLines}
                                testID="proof-error"
                            />
                        </Rise>
                        {pendingScans ? (
                            <PrimaryAction label={t('proof.scan.tryAgain')} icon="retry" loading={sending} onPress={() => void sendScans()} testID="proof-submit-scan" />
                        ) : takenScans ? (
                            // Nothing left to send but some were taken: the step can go on with those.
                            <PrimaryAction label={t('proof.scan.continue')} onPress={finishScans} testID="proof-submit-scan" />
                        ) : null}
                        {/* A refused label is scanned again: this puts the message away and the camera back to work. */}
                        {problemFinal || !canSend ? <GlassAction label={t('proof.scan.scanAgain')} onPress={() => setProblem(null)} testID="proof-scan-again" /> : null}
                    </>
                ) : saved ? (
                    <>
                        <Rise key="saved" from={80}>
                            <MessageCard
                                tone="calm"
                                icon="noSignal"
                                title={t('proof.scan.card.savedTitle')}
                                lines={[{ text: t('proof.scan.card.savedBody', { count: saved }), look: 'bright' }, { text: t('proof.scan.card.savedNext') }]}
                                testID="proof-scan-saved"
                            />
                        </Rise>
                        <PrimaryAction label={t('proof.scan.continue')} onPress={finishScans} testID="proof-submit-scan" />
                    </>
                ) : (
                    <>
                        {notice ? <Rise key={notice.id}>{noticeCard()}</Rise> : settledStrip()}
                        {complete && canSend ? <PrimaryAction label={actLabel} icon={total > 0 ? 'check' : undefined} loading={sending} onPress={act} testID="proof-submit-scan" /> : null}
                    </>
                )}
            </YStack>

            {/* The drawer: at rest it is a handle that counts; pulled up, the list of the order's items. */}
            <BottomSheet
                ref={sheetRef}
                index={0}
                snapPoints={snapPoints}
                enableDynamicSizing={false}
                enablePanDownToClose={false}
                enableOverDrag={false}
                animateOnMount={false}
                // Told as the drawer starts to move, so the camera stops answering as it opens rather than after.
                onAnimate={(_from: number, to: number) => setDrawerOpen(to > 0)}
                onChange={(index: number) => setDrawerOpen(index > 0)}
                style={styles.drawerShadow}
                backgroundStyle={{ backgroundColor: theme.background?.val as string, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: theme.border?.val as string }}
                handleIndicatorStyle={{ backgroundColor: theme.border?.val as string, width: 40, height: 5 }}
                handleStyle={{ paddingTop: 8, paddingBottom: 6 }}
            >
                <DrawerHandleRow title={drawerTitle} marks={total > 0 ? items.map(isScanned) : undefined} aside={drawerAside} open={drawerOpen} label={drawerLabel} onPress={toggleDrawer} testID="proof-drawer-handle" />
                <BottomSheetScrollView
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                    alwaysBounceVertical={false}
                    overScrollMode="never"
                    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) }}
                >
                    <YStack testID="proof-checklist">
                        {total > 0
                            ? items.map((item, index) => checklistRow(item.key, item.name ?? item.trackingNumber ?? item.key, item.trackingNumber ?? item.key, index))
                            : Object.keys(scans).map((key, index) => checklistRow(key, scans[key].label, scans[key].label, index))}
                        {rowCount ? null : <Secondary paddingVertical={16}>{t('proof.scan.drawer.empty')}</Secondary>}
                    </YStack>
                    {drawerActionShown ? (
                        /*
                         * The same send as the camera view's button. With every
                         * item scanned it is the primary button here too; with
                         * only some, it is the quieter way to go on, so the
                         * driver is never stuck behind a label that will not scan.
                         */
                        <YStack paddingTop={16}>
                            <Button fullWidth height={56} variant={complete ? 'primary' : 'secondary'} loading={sending} onPress={act} testID="proof-drawer-submit">
                                {actLabel}
                            </Button>
                        </YStack>
                    ) : null}
                </BottomSheetScrollView>
            </BottomSheet>

            <TypeCodeSheet
                visible={typing}
                onClose={() => setTyping(false)}
                onSubmit={(code) => {
                    setTyping(false);
                    onRead(code, true);
                }}
                bottomInset={insets.bottom}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: onCamera.ground, overflow: 'hidden' },
    fade: { position: 'absolute', left: 0, right: 0, top: 0 },
    drawerShadow: { shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: -14 } },
});

export default ProofScan;
