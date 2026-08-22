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
import { useCallback, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Surface } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Banner';
import { ScannerOverlay, ScanChecklistRow } from '../ui/Scanner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useScreenStyle } from '../ui/useScreenStyle';
import { useProofCapture, proofMethodOf, type ProofMethod, type ProofOutcome } from '../data/useProofCapture';
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
const lazyScanner = () => require('../../components/QrCodeScanner').QrCodeScanner as React.ComponentType<{ onScan: (code: string) => void }>;
const lazyCamera = () => require('../../components/CameraCapture').default as React.ComponentType<{ onDone?: (photos: CapturedPhoto[]) => void }>;
const lazySignaturePad = () => require('react-native-signature-canvas').default as React.ComponentType<Record<string, unknown>>;

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
    expected = [],
    subjectId,
    onCaptured,
    onCancel,
}: ProofCaptureScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const method: ProofMethod = proofMethodOf(podMethod);
    const { capture, isCapturing, error } = useProofCapture(orderId);

    const [scanned, setScanned] = useState<string[]>([]);
    const [photos, setPhotos] = useState<string[]>([]);
    const signatureRef = useRef<{ readSignature: () => void } | null>(null);

    const send = useCallback(
        async (payload: Parameters<typeof capture>[0]) => {
            const outcome = await capture(payload, subjectId);
            if (outcome !== 'failed') onCaptured?.(outcome);
        },
        [capture, onCaptured, subjectId]
    );

    const onScan = useCallback(
        (code: string) => {
            setScanned((prev) => {
                // A driver scanning a dozen parcels will re-scan one; counting
                // it twice would tell them they are further along than they are.
                if (prev.includes(code)) return prev;
                return [...prev, code];
            });
        },
        []
    );

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="proof-capture">
            <YStack gap={space[1]}>
                <Caption>{t('proof.forActivity')}</Caption>
                <Body fontSize={17} fontWeight="800" testID="proof-activity">
                    {activityLabel}
                </Body>
                <Micro testID="proof-method">{t(`proof.method.${method}`)}</Micro>
            </YStack>

            {error ? <Banner tone="danger" message={t('proof.failed')} testID="proof-error" /> : null}

            {method === 'scan' ? (
                <YStack gap={space[3]} testID="proof-scan">
                    <View style={{ height: 280 }}>
                        {(() => { const Scanner = lazyScanner(); return <Scanner onScan={onScan} />; })()}
                    </View>
                    <ScannerOverlay scanned={scanned.length} expected={expected.length} lastCode={scanned[scanned.length - 1]} feedback={scanned.length ? 'accepted' : 'idle'} />
                    {expected.length ? (
                        <Surface testID="proof-checklist">
                            {expected.map((code) => (
                                <ScanChecklistRow key={code} name={code} code={code} scannedAt={scanned.includes(code) ? formatClock(new Date().toISOString()) : undefined} />
                            ))}
                        </Surface>
                    ) : null}
                    <Button
                        fullWidth
                        disabled={!scanned.length || isCapturing}
                        loading={isCapturing}
                        onPress={() => send({ method: 'scan', codes: scanned })}
                        testID="proof-submit-scan"
                    >
                        {t('proof.submitScan', { count: scanned.length })}
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
