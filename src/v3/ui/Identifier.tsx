/**
 * Identifier — tracking numbers, entity IDs, serial numbers, coordinates.
 *
 * The single most-cited complaint about v2 was truncated identifiers: a driver
 * reading "FLE…8718SG" off a screen cannot match it to a label on a parcel. The
 * design's rule is absolute — identifiers render in full, monospaced, on their
 * own line, never truncated.
 *
 * This component exists so that rule is structural rather than a thing each
 * screen has to remember. It deliberately exposes no `numberOfLines` prop.
 */
import { styled, XStack, YStack } from 'tamagui';
import { Text, Caption } from './Text';
import { radius, space } from '../theme/tokens';

const Mono = styled(Text, {
    name: 'IdentifierMono',
    fontFamily: '$mono',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
    color: '$textSecondary',
    // Long identifiers wrap rather than ellipsize.
    flexShrink: 1,
    flexWrap: 'wrap',
});

export interface IdentifierProps {
    /** The identifier itself. Rendered verbatim. */
    value?: string | null;
    /** Optional label above, e.g. "TRACKING NUMBER". */
    label?: string;
    /** Boxed treatment used on cards; plain inline elsewhere. */
    boxed?: boolean;
    /** Right-hand slot — a copy affordance, a status pill. */
    accessory?: React.ReactNode;
    testID?: string;
}

export function Identifier({ value, label, boxed = true, accessory, testID }: IdentifierProps) {
    if (!value) return null;

    const mono = (
        <Mono selectable accessibilityLabel={label ? `${label}: ${value}` : value}>
            {value}
        </Mono>
    );

    const content = boxed ? (
        <XStack
            alignItems="center"
            gap="$2"
            backgroundColor="$background"
            borderWidth={1}
            borderColor="$border"
            borderRadius={radius.compact - 1}
            paddingHorizontal={space[3]}
            paddingVertical={space[2]}
        >
            <YStack flex={1}>{mono}</YStack>
            {accessory}
        </XStack>
    ) : (
        <XStack alignItems="center" gap="$2">
            <YStack flex={1}>{mono}</YStack>
            {accessory}
        </XStack>
    );

    if (!label) return <YStack testID={testID}>{content}</YStack>;

    return (
        <YStack gap="$1" testID={testID}>
            <Caption>{label}</Caption>
            {content}
        </YStack>
    );
}

export default Identifier;
