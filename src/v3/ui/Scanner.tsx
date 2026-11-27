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
import Svg, { Path } from 'react-native-svg';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Micro } from './Text';
import { Button } from './Button';
import { radius, space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';

export type ScanFeedback = 'idle' | 'accepted' | 'duplicate' | 'unexpected';

/*
 * What is drawn over the live camera keeps one set of colours in every scheme:
 * it sits on a picture of a van or a depot, not on a surface of the theme, and
 * has to read on whatever that picture is. Sheets and drawers use the theme.
 */
export const onCamera = {
    /** Behind everything, where the camera has nothing to show. */
    ground: '#05080D',
    /** The dimming outside the scan frame. */
    dim: 'rgba(3,6,10,0.58)',
    /** The dark backing of a control or a line of text. */
    glass: 'rgba(10,15,23,0.9)',
    glassBorder: '#223046',
    quietBorder: '#3A4A63',
    text: '#F2F5F9',
    textSoft: '#C3CEDD',
    textFaint: '#A3B1C6',
    empty: '#5F7191',
    success: '#34D399',
    onSuccess: '#06210F',
    successFill: '#0C2A1E',
    successBorder: '#1F6B4A',
    successSoft: '#D3E9DD',
    warning: '#F5B341',
    onWarning: '#2A1E02',
    warningFill: '#1D1808',
    warningBorder: '#5C4710',
    danger: '#F26D6D',
    onDanger: '#2A0A0C',
    dangerText: '#FF9A9A',
    dangerSoft: '#F0C9C9',
    dangerFill: '#2A1114',
    dangerBorder: '#6B2329',
    calmFill: '#111927',
    calmIcon: '#17212F',
} as const;

const FRAME_TONE: Record<ScanFeedback, string> = {
    idle: onCamera.text,
    accepted: onCamera.success,
    duplicate: onCamera.warning,
    unexpected: onCamera.danger,
};

const CORNER = 44;
const CORNER_STROKE = 5;
const FRAME_RADIUS = 22;

/**
 * The one scan frame: four corners, nothing across the middle to hide a label.
 * White while it waits; green for the moment a label is read, amber for one
 * already scanned, red for one that is not wanted. The colour is never the only
 * sign: `readLabel` puts the word on the frame, and the host says the rest.
 */
export function ScanFrame({ width = 300, height = 190, tone = 'idle', readLabel, testID }: { width?: number; height?: number; tone?: ScanFeedback; readLabel?: string; testID?: string }) {
    const color = FRAME_TONE[tone];
    const corner = { position: 'absolute' as const, width: CORNER, height: CORNER, borderColor: color };
    return (
        <YStack width={width} height={height} testID={testID} accessibilityLabel="Scanner viewfinder" pointerEvents="none">
            <YStack {...corner} left={0} top={0} borderLeftWidth={CORNER_STROKE} borderTopWidth={CORNER_STROKE} borderTopLeftRadius={FRAME_RADIUS} />
            <YStack {...corner} right={0} top={0} borderRightWidth={CORNER_STROKE} borderTopWidth={CORNER_STROKE} borderTopRightRadius={FRAME_RADIUS} />
            <YStack {...corner} left={0} bottom={0} borderLeftWidth={CORNER_STROKE} borderBottomWidth={CORNER_STROKE} borderBottomLeftRadius={FRAME_RADIUS} />
            <YStack {...corner} right={0} bottom={0} borderRightWidth={CORNER_STROKE} borderBottomWidth={CORNER_STROKE} borderBottomRightRadius={FRAME_RADIUS} />
            {readLabel && tone === 'accepted' ? (
                <XStack position="absolute" left={0} right={0} bottom={-16} justifyContent="center">
                    <XStack alignItems="center" gap={6} height={32} paddingHorizontal={12} borderRadius={16} backgroundColor={onCamera.success}>
                        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={onCamera.onSuccess} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M5 12.5l4.5 4.5L19 7.5" />
                        </Svg>
                        <Body fontSize={14} lineHeight={18} fontWeight="800" color={onCamera.onSuccess} numberOfLines={1}>
                            {readLabel}
                        </Body>
                    </XStack>
                </XStack>
            ) : null}
        </YStack>
    );
}

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
    note,
    hint = 'Point at any label — multi-scan stays open',
    onManualEntry,
    testID,
}: {
    scanned: number;
    expected: number;
    feedback?: ScanFeedback;
    /** The code that produced `feedback`, rendered in full. */
    lastCode?: string;
    /** What came of that read, in words: the mark and the colour never say it alone. */
    note?: string;
    hint?: string;
    onManualEntry?: () => void;
    testID?: string;
}) {
    const { t } = useTranslation();
    const fb = feedback !== 'idle' ? feedbackCopy[feedback] : null;

    return (
        <YStack testID={testID} flex={1} justifyContent="space-between">
            <YStack alignItems="center" paddingTop={space[4]}>
                <Micro color="$white">{hint}</Micro>
            </YStack>

            {/* Viewfinder: the same frame the proof screen draws. */}
            <YStack alignItems="center" justifyContent="center">
                <ScanFrame width={240} height={150} tone={feedback} />
            </YStack>

            <YStack gap={space[3]} padding={space[4]}>
                {fb && (lastCode || note) ? (
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
                        <YStack flex={1} gap={2}>
                            {/* Codes render in full — a driver matches this against a label. */}
                            {lastCode ? (
                                <Body fontFamily="$mono" fontSize={13} tone={fb.tone}>
                                    {lastCode}
                                </Body>
                            ) : null}
                            {note ? (
                                <Body fontSize={13} fontWeight="600" tone={fb.tone}>
                                    {note}
                                </Body>
                            ) : null}
                        </YStack>
                    </XStack>
                ) : null}

                <XStack alignItems="center" justifyContent="space-between">
                    <Body fontWeight="800" tabular color="$white">
                        {/* With nothing to count against, the count alone: "1 / 0" reads as a fault. */}
                        {expected > 0 ? `${scanned} / ${expected}` : `${scanned}`}
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

/**
 * One expected item in the checklist: its name, its tracking number in full,
 * and where it stands. The state is a mark and words together ("Scanned 21:41",
 * "To scan", or what went wrong), never a colour alone.
 */
export function ScanChecklistRow({
    name,
    code,
    scannedAt,
    problem,
    note,
    divided,
    testID,
}: {
    name: string;
    code: string;
    /** Clock time when scanned; absent means still to scan. */
    scannedAt?: string;
    /** The scan was refused or is still to be sent: said in words, in place of the time. */
    problem?: string;
    /** Extra state of a scan that stands, after its time ("waiting to send"). */
    note?: string;
    /** A line above the row, for every row but the first of a list. */
    divided?: boolean;
    testID?: string;
}) {
    const { t } = useTranslation();
    const theme = useTheme();
    const done = !!scannedAt && !problem;
    const state = problem ? problem : done ? t('proof.scan.row.scanned', { time: scannedAt }) : t('proof.scan.row.toScan');
    // The name is left out when it would only repeat the number under it.
    const named = !!name && name !== code;
    return (
        <XStack
            testID={testID}
            alignItems="center"
            gap={space[3]}
            minHeight={64}
            paddingVertical={10}
            borderTopWidth={divided ? 1 : 0}
            borderColor="$border"
            accessible
            accessibilityLabel={`${named ? `${name}, ` : ''}${code}, ${state}${done && note ? `, ${note}` : ''}`}
        >
            <YStack
                width={28}
                height={28}
                borderRadius={14}
                flexShrink={0}
                alignItems="center"
                justifyContent="center"
                borderWidth={1.5}
                borderStyle={problem || done ? 'solid' : 'dashed'}
                borderColor={problem ? '$dangerBorder' : done ? '$successBorder' : '$textMuted'}
                backgroundColor={problem ? '$dangerFill' : done ? '$successFill' : '$transparent'}
            >
                {problem || done ? (
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={(problem ? theme.dangerText?.val : theme.successText?.val) as string} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round">
                        <Path d={problem ? 'M6 6l12 12M18 6L6 18' : 'M5 12.5l4.5 4.5L19 7.5'} />
                    </Svg>
                ) : null}
            </YStack>
            <YStack flex={1} minWidth={0} gap={1}>
                {named ? (
                    <Body fontSize={16} lineHeight={21} fontWeight="700">
                        {name}
                    </Body>
                ) : null}
                {/* In full: the driver matches it against the number printed under the barcode. */}
                <Body fontFamily="$mono" fontSize={14} lineHeight={19} fontWeight="600" tone={named ? 'secondary' : 'primary'}>
                    {code}
                </Body>
            </YStack>
            <YStack flexShrink={0} maxWidth={132} alignItems="flex-end">
                <Body fontSize={14} lineHeight={19} fontWeight="700" tone={problem ? 'danger' : done ? 'success' : 'secondary'} tabular textAlign="right">
                    {state}
                </Body>
                {done && note ? (
                    <Micro tone="secondary" textAlign="right">
                        {note}
                    </Micro>
                ) : null}
            </YStack>
        </XStack>
    );
}
