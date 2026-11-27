/**
 * What opens over an item: the scanner for it, and its photo full-screen.
 *
 * Both are plain views that fill whatever hosts them (the pager modal, or the
 * item screen), not modals of their own: a modal opened from inside a modal is
 * not something both platforms agree on.
 *
 * The scanner is the app's one camera scanner (the ported QrCodeScanner, which
 * owns the vision-camera dependency) under the app's scanner overlay. A code it
 * reads is handed to the host, which sends it as scan proof for the item; the
 * scanner says what came of it and, once a scan is accepted, closes itself.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body } from '../../ui/Text';
import { ScannerOverlay, type ScanFeedback } from '../../ui/Scanner';
import { useTranslation } from '../../i18n/useTranslation';
import type { ProofOutcome } from '../../data/useProofCapture';
import { itemScanFailureOf } from '../../data/useItemScans';
import { parseScanCode, scanLabelOf, scanTextOf } from '../../data/scanCode';
import { Glyph } from '../jobs/parts';

/*
 * Loaded only when the scanner opens: VisionCamera initialises its native
 * module at import time, and an order screen that is never scanned from should
 * not pay for a camera (see ProofCaptureScreen).
 */
const lazyScanner = () =>
    require('../../../components/QrCodeScanner').QrCodeScanner as React.ComponentType<{ onScan: (code: { value?: string } | string) => void; scanCooldown?: number; frame?: boolean }>;

/** White on the camera feed or the photo, whatever the theme: it sits on a picture, not on a surface. */
const ON_PICTURE = '#FFFFFF';
const PICTURE_BUTTON = 'rgba(0,0,0,0.55)';

function CloseOnPicture({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
    return (
        <YStack width={48} height={48} borderRadius={24} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor={PICTURE_BUTTON} onPress={onPress} pressStyle={{ opacity: 0.7 }} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
            <Glyph name="close" size={18} strokeWidth={2.6} color={ON_PICTURE} />
        </YStack>
    );
}

export interface ScanTarget {
    /** The id the item is scanned under (`entity_…`). */
    subjectId: string;
    name?: string;
    /** The item's tracking number: what its label carries. */
    code?: string;
}

export function ItemScanner({
    item,
    onCode,
    onClose,
    topInset = 0,
    bottomInset = 0,
}: {
    item: ScanTarget;
    /** Sends the code as scan proof for the item, and says what came of it. */
    onCode: (code: string) => Promise<ProofOutcome>;
    onClose: () => void;
    topInset?: number;
    bottomInset?: number;
}) {
    const { t } = useTranslation();
    const Scanner = useMemo(() => lazyScanner(), []);
    const [feedback, setFeedback] = useState<ScanFeedback>('idle');
    const [lastCode, setLastCode] = useState<string | undefined>(undefined);
    const [sending, setSending] = useState(false);
    const [queued, setQueued] = useState(false);
    const [rejection, setRejection] = useState<string | undefined>(undefined);
    const busy = useRef(false);
    const alive = useRef(true);
    const closing = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            if (closing.current) clearTimeout(closing.current);
        };
    }, []);

    const onScan = useCallback(
        async (scanned: { value?: string } | string) => {
            // The scanner hands back its result object; the text is in `value`.
            const value = scanTextOf(scanned);
            if (!value || busy.current) return;
            /*
             * The label carries the item twice: a barcode (its tracking number)
             * and a QR code (the tracking page's address, naming the number and
             * the item's id). Either is this item's code. What is shown is the
             * tracking number, never the address; what is sent is what was read.
             */
            const code = parseScanCode(value);
            const shown = scanLabelOf(code);
            setLastCode(shown);
            if (code.publicId && code.publicId.startsWith('entity_') && code.publicId !== item.subjectId) {
                // A QR code names its item, and this one names another: not sent.
                setRejection(t('itemDetail.scanWrongItem'));
                setFeedback('unexpected');
                return;
            }
            busy.current = true;
            setRejection(undefined);
            setSending(true);
            const outcome = await onCode(value);
            if (!alive.current) return;
            setSending(false);
            if (outcome === 'failed') {
                // Say why, in the server's terms where it gave them, and keep the camera open.
                const why = itemScanFailureOf(item.subjectId);
                setRejection(
                    why?.failure === 'notOnOrder'
                        ? t('itemDetail.scanNotOnOrder')
                        : why?.failure === 'noSignal'
                          ? t('itemDetail.scanNotSent')
                          : why?.failure === 'orderMissing'
                            ? t('proof.scan.failure.orderMissing')
                            : why?.failure === 'other' && why.message
                              ? t('itemDetail.scanServerSaid', { reason: why.message })
                              : t('itemDetail.scanRejected')
                );
                setFeedback('unexpected');
                busy.current = false;
                return;
            }
            setQueued(outcome === 'queued');
            setFeedback('accepted');
            // Long enough to see the tick, then back to the item.
            closing.current = setTimeout(onClose, 700);
        },
        [onCode, onClose, item.subjectId, t]
    );

    const message = sending
        ? t('itemDetail.scanSending')
        : feedback === 'unexpected'
          ? (rejection ?? t('itemDetail.scanRejected'))
          : feedback === 'accepted'
            ? queued
                ? t('proof.queued')
                : t('itemDetail.scanAccepted')
            : undefined;

    return (
        <View style={[StyleSheet.absoluteFill, styles.picture]} testID="item-scanner">
            <View style={StyleSheet.absoluteFill}>
                <Scanner onScan={onScan} frame={false} />
            </View>
            <YStack flex={1} paddingTop={Math.max(topInset, 16)} paddingBottom={Math.max(bottomInset, 16)} pointerEvents="box-none">
                <XStack alignItems="center" gap={12} paddingHorizontal={16} pointerEvents="box-none">
                    <CloseOnPicture label={t('itemDetail.scanClose')} onPress={onClose} testID="item-scanner-close" />
                    <YStack flex={1} minWidth={0} pointerEvents="none">
                        <Body fontSize={17} lineHeight={22} fontWeight="800" color={ON_PICTURE}>
                            {item.name ?? t('itemDetail.untitled')}
                        </Body>
                        {/* In full: the driver matches it against the label in front of the camera. */}
                        {item.code ? (
                            <Body fontFamily="$mono" fontSize={14} lineHeight={19} fontWeight="600" color={ON_PICTURE}>
                                {item.code}
                            </Body>
                        ) : null}
                    </YStack>
                </XStack>
                <YStack flex={1} pointerEvents="none">
                    <ScannerOverlay scanned={feedback === 'accepted' ? 1 : 0} expected={1} feedback={feedback} lastCode={lastCode} hint={t('itemDetail.scanHint')} />
                </YStack>
                {message ? (
                    <YStack paddingHorizontal={16} pointerEvents="none">
                        <Body fontSize={16} lineHeight={22} fontWeight="700" color={ON_PICTURE} center testID="item-scanner-message">
                            {message}
                        </Body>
                    </YStack>
                ) : null}
            </YStack>
        </View>
    );
}

/** The item's photo, as large as the screen allows. Tap anywhere to close. */
export function PhotoViewer({ uri, name, onClose, topInset = 0 }: { uri: string; name?: string; onClose: () => void; topInset?: number }) {
    const { t } = useTranslation();
    return (
        <View style={[StyleSheet.absoluteFill, styles.picture]} testID="item-photo-full">
            <YStack flex={1} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('itemDetail.photoClose')}>
                <Image source={{ uri }} style={styles.photo} resizeMode="contain" accessibilityLabel={name} />
            </YStack>
            <YStack position="absolute" top={Math.max(topInset, 16)} left={16}>
                <CloseOnPicture label={t('itemDetail.photoClose')} onPress={onClose} testID="item-photo-close" />
            </YStack>
        </View>
    );
}

const styles = StyleSheet.create({
    picture: { backgroundColor: '#000000' },
    photo: { flex: 1, width: '100%' },
});
