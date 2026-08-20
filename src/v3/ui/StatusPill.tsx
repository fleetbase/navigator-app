/**
 * StatusPill — the design's status treatment.
 *
 * Never colour-only: hue is paired with a distinct marker shape and glyph, so
 * the pill still reads under glare, in greyscale, and for colour-blind drivers.
 * All colour comes from the active scheme via the registry's token names, which
 * is what lets this render correctly in dark / light / sunlight / night without
 * the `isDarkMode` branch v2 needed in ~30 components.
 */
import { XStack, YStack, styled } from 'tamagui';
import { Micro } from './Text';
import { describeStatus, type StatusShape } from '../theme/status';
import { radius, space } from '../theme/tokens';

const Marker = styled(YStack, {
    name: 'StatusMarker',
    width: 8,
    height: 8,
    variants: {
        shape: {
            circle: { borderRadius: 999 },
            square: { borderRadius: 2 },
            diamond: { borderRadius: 2, rotate: '45deg' },
        } as Record<StatusShape, object>,
    } as const,
});

export interface StatusPillProps {
    /** Raw status straight from the API — normalisation happens in the registry. */
    status?: string | null;
    /** Override the rendered label; defaults to a humanised status. */
    label?: string;
    /** Translated label, if the caller has already resolved one. */
    t?: (key: string, fallback: string) => string;
    size?: 'sm' | 'md';
    testID?: string;
}

export function StatusPill({ status, label, t, size = 'md', testID }: StatusPillProps) {
    if (!status && !label) return null;

    const d = describeStatus(status);
    const text = label ?? (t ? t(d.labelKey, d.defaultLabel) : d.defaultLabel);
    const pad = size === 'sm' ? space[2] : space[3];

    return (
        <XStack
            testID={testID}
            alignItems="center"
            gap={space[2] - 2}
            alignSelf="flex-start"
            paddingHorizontal={pad}
            paddingVertical={size === 'sm' ? 3 : 5}
            borderRadius={radius.pill}
            borderWidth={1}
            backgroundColor={d.fillToken as any}
            borderColor={d.borderToken as any}
            accessibilityRole="text"
            accessibilityLabel={`Status: ${text}`}
        >
            <Marker shape={d.shape} backgroundColor={d.textToken as any} />
            <Micro color={d.textToken as any} numberOfLines={1}>
                {text}
            </Micro>
        </XStack>
    );
}

/**
 * Map pin / list bullet variant of the same status vocabulary.
 * `seq` renders the stop sequence number inside the pin.
 */
export function StatusMarkerPin({ status, seq, size = 26 }: { status?: string | null; seq?: number | string; size?: number }) {
    const d = describeStatus(status);
    return (
        <YStack
            width={size}
            height={size}
            alignItems="center"
            justifyContent="center"
            backgroundColor={d.textToken as any}
            // Teardrop: round on three corners, pointed bottom-left, rotated upright.
            borderTopLeftRadius={999}
            borderTopRightRadius={999}
            borderBottomRightRadius={999}
            borderBottomLeftRadius={4}
            rotate="-45deg"
        >
            <Micro rotate="45deg" color="$background" fontSize={size * 0.42}>
                {seq ?? d.glyph}
            </Micro>
        </YStack>
    );
}

export default StatusPill;
