/**
 * Duty pill — the shell's primary control.
 *
 * v2 put a bare green Switch here with no label, so "online" was indistinguishable
 * from "on shift" and the driver had no idea what it toggled. The pill states its
 * state in words, pairs it with a coloured dot, and opens a sheet rather than
 * flipping destructively on a single tap.
 */
import { Spinner, XStack } from 'tamagui';
import { Micro } from '../ui/Text';
import { hitTarget, radius, space } from '../theme/tokens';
import type { DutyState } from './DutyContext';

export const dutyLabel: Record<DutyState, string> = {
    off: 'Off duty',
    on: 'On duty',
    break: 'On break',
};

const tone: Record<DutyState, { fill: string; border: string; text: string; dot: string }> = {
    off: { fill: '$surfaceRaised', border: '$border', text: '$textSecondary', dot: '$textMuted' },
    on: { fill: '$successFill', border: '$successBorder', text: '$successText', dot: '$successText' },
    break: { fill: '$warningFill', border: '$warningBorder', text: '$warningText', dot: '$warningText' },
};

export function DutyPill({
    duty,
    isChanging,
    onPress,
    testID,
}: {
    duty: DutyState;
    isChanging?: boolean;
    onPress?: () => void;
    testID?: string;
}) {
    const t = tone[duty];

    return (
        <XStack
            testID={testID ?? 'duty-pill'}
            alignItems="center"
            gap={space[2]}
            height={34}
            minWidth={hitTarget.min}
            paddingHorizontal={space[3]}
            borderRadius={radius.pill}
            borderWidth={1.5}
            backgroundColor={t.fill as never}
            borderColor={t.border as never}
            onPress={onPress}
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityLabel={`Duty status: ${dutyLabel[duty]}. Tap to change.`}
            accessibilityState={{ busy: !!isChanging }}
        >
            {isChanging ? (
                <Spinner size="small" color={t.text as never} />
            ) : (
                <XStack width={8} height={8} borderRadius={999} backgroundColor={t.dot as never} />
            )}
            <Micro color={t.text as never}>{dutyLabel[duty]}</Micro>
        </XStack>
    );
}

export default DutyPill;
