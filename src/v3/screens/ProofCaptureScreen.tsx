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
 * `react-native-vision-camera` keeps a single owner. Scanning and signing are
 * screens of their own (screens/proof/ProofScan, screens/proof/ProofSignature);
 * the signature pad is drawn by the app, so it is the one that works in a
 * simulator — worth knowing when reading any verification claim about this
 * screen.
 *
 * Capture happens **before** the activity update, never after, so a driver is
 * never left holding an order marked delivered with no proof attached to it.
 */
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ScrollView } from '../ui/Scroll';
import { YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useScreenStyle } from '../ui/useScreenStyle';
import { useProofCapture, proofMethodOf, type ProofMethod, type ProofOutcome } from '../data/useProofCapture';
import { recordProof } from '../data/proofLedger';
import type { CapturedPhoto } from '../../components/CameraCapture';
import { ProofScan } from './proof/ProofScan';
import { ProofSignature } from './proof/ProofSignature';

/*
 * The camera is loaded only when a config actually asks for it. VisionCamera
 * initialises its native module at import time, so importing it at module
 * scope makes every screen that merely *routes* to this one — the whole
 * navigator — depend on a native binary. A driver whose flow needs no proof
 * should not pay for a camera, and a test of the tab bar should not need one
 * either.
 */
const lazyCamera = () => require('../../components/CameraCapture').default as React.ComponentType<{ onDone?: (photos: CapturedPhoto[]) => void }>;

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
    /** The shell's strip about signal and syncing is showing over the top of the screen (the scan and signature screens make room for it). */
    stripShowing?: boolean;
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
    stripShowing,
    onCaptured,
    onCancel,
}: ProofCaptureScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const method: ProofMethod = proofMethodOf(podMethod);
    const { capture, isCapturing, error, lastProofId } = useProofCapture(orderId);

    const [photos, setPhotos] = useState<string[]>([]);

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

    /*
     * Scanning is its own screen: the camera edge to edge, with its own close
     * button, its drawer and its states (screens/proof/ProofScan). A photo
     * stays as it was, below.
     */
    if (method === 'scan') {
        return (
            <ProofScan
                orderId={orderId}
                activityCode={activityCode}
                activityLabel={activityLabel}
                expected={expected}
                subjectId={subjectId}
                stripShowing={stripShowing}
                onCaptured={onCaptured}
                onCancel={onCancel}
            />
        );
    }

    /*
     * Signing is its own screen too: the pad edge to edge, upright or with the
     * phone on its side, with its own close button and its states
     * (screens/proof/ProofSignature).
     */
    if (method === 'signature') {
        return (
            <ProofSignature
                orderId={orderId}
                activityCode={activityCode}
                activityLabel={activityLabel}
                expected={expected}
                subjectId={subjectId}
                stripShowing={stripShowing}
                onCaptured={onCaptured}
                onCancel={onCancel}
            />
        );
    }

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

        </ScrollView>
    );
}

export default ProofCaptureScreen;
