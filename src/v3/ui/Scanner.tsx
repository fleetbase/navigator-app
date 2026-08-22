/**
 * Scanner viewfinder overlay.
 *
 * Multi-scan stays open: the design's rule is that a driver scanning 12 parcels
 * never leaves the camera. Progress and per-scan feedback render over the feed,
 * and a manual-entry escape exists for a damaged label.
 *
 * This is the overlay only — the camera itself stays in the ported
 * QrCodeScanner so the vision-camera dependency has one owner.
 */
import { XStack, YStack } from 'tamagui';
import { Body, Micro } from './Text';
import { Button } from './Button';
import { radius, space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';

export type ScanFeedback = 'idle' | 'accepted' | 'duplicate' | 'unexpected';

const feedbackCopy: Record<Exclude<ScanFeedback, 'idle'>, { tone: 'success' | 'warning' | 'danger'; prefix: string }> = {
    accepted: { tone: 'success', prefix: '✓' },
    duplicate: { tone: 'warning', prefix: '↺' },
    unexpected: { tone: 'danger', prefix: '✕' },
};

export function ScannerOverlay({
    scanned,
    expected,
    feedback = 'idle',
    lastCode,
    hint = 'Point at any label — multi-scan stays open',
    onManualEntry,
    testID,
}: {
    scanned: number;
    expected: number;
    feedback?: ScanFeedback;
    /** The code that produced `feedback`, rendered in full. */
    lastCode?: string;
    hint?: string;
    onManualEntry?: () => void;
    testID?: string;
}) {
    const { t } = useTranslation();
    const frameColor = feedback === 'unexpected' ? '$danger' : feedback === 'duplicate' ? '$warning' : '$successText';
    const fb = feedback !== 'idle' ? feedbackCopy[feedback] : null;

    return (
        <YStack testID={testID} flex={1} justifyContent="space-between">
            <YStack alignItems="center" paddingTop={space[4]}>
                <Micro color="$white">{hint}</Micro>
            </YStack>

            {/* Viewfinder */}
            <YStack alignItems="center" justifyContent="center">
                <YStack
                    width={240}
                    height={150}
                    borderRadius={radius.hero - 4}
                    borderWidth={2.5}
                    borderColor={frameColor as never}
                    accessibilityLabel="Scanner viewfinder"
                >
                    <YStack position="absolute" top="50%" left={space[5]} right={space[5]} height={2} backgroundColor={frameColor as never} />
                </YStack>
            </YStack>

            <YStack gap={space[3]} padding={space[4]}>
                {fb && lastCode ? (
                    <XStack
                        alignItems="center"
                        gap={space[2]}
                        padding={space[3]}
                        borderRadius={radius.compact}
                        backgroundColor="$surface"
                        borderWidth={1}
                        borderColor={`$${fb.tone === 'success' ? 'success' : fb.tone}Border` as never}
                    >
                        <Body tone={fb.tone} fontWeight="700">
                            {fb.prefix}
                        </Body>
                        {/* Codes render in full — a driver matches this against a label. */}
                        <Body flex={1} fontFamily="$mono" fontSize={13} tone={fb.tone}>
                            {lastCode}
                        </Body>
                    </XStack>
                ) : null}

                <XStack alignItems="center" justifyContent="space-between">
                    <Body fontWeight="800" tabular color="$white">
                        {scanned} / {expected}
                    </Body>
                    {onManualEntry ? (
                        <Button variant="ghost" height={38} onPress={onManualEntry}>
                            {t('ui.manualEntry')}
                        </Button>
                    ) : null}
                </XStack>
            </YStack>
        </YStack>
    );
}

/** One expected item in the stop's scan checklist. */
export function ScanChecklistRow({
    name,
    code,
    scannedAt,
    testID,
}: {
    name: string;
    code: string;
    /** Clock time when scanned; absent means still awaiting. */
    scannedAt?: string;
    testID?: string;
}) {
    const done = !!scannedAt;
    return (
        <XStack
            testID={testID}
            alignItems="center"
            gap={space[3]}
            padding={space[3]}
            borderRadius={radius.compact}
            borderWidth={1}
            borderColor={done ? '$successBorder' : '$border'}
            backgroundColor={done ? '$successFill' : '$surface'}
        >
            <YStack flex={1} gap={2}>
                <Body fontSize={14} fontWeight="600">
                    {name}
                </Body>
                <Body fontFamily="$mono" fontSize={12} tone="secondary">
                    {code}
                </Body>
            </YStack>
            <Micro tone={done ? 'success' : 'muted'} tabular>
                {done ? `SCANNED ${scannedAt}` : 'AWAITING'}
            </Micro>
        </XStack>
    );
}
