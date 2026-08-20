/**
 * Duty sheet — the confirmation behind the pill.
 *
 * Presented rather than toggled because going off duty mid-route has
 * consequences, and because "break" needs to be reachable without a second
 * control. Options the organisation cannot support are shown disabled with the
 * reason, not hidden — a driver looking for "break" should learn it is
 * unavailable rather than conclude the app is broken.
 */
import { XStack, YStack } from 'tamagui';
import { Body, Heading, Micro, Secondary } from '../ui/Text';
import { Surface } from '../ui/Surface';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { radius, space } from '../theme/tokens';
import { dutyLabel } from './DutyPill';
import type { DutyState } from './DutyContext';

const description: Record<DutyState, string> = {
    off: 'Not receiving work. Location tracking stops.',
    on: 'Receiving work. Location is shared with dispatch.',
    break: 'Stay on shift without receiving new work.',
};

export function DutySheet({
    duty,
    breakSupported,
    isChanging,
    error,
    onSelect,
    onDismiss,
    /** Warn before going off duty with work in hand. */
    activeStopCount = 0,
    testID,
}: {
    duty: DutyState;
    breakSupported: boolean;
    isChanging?: boolean;
    error?: Error | null;
    onSelect: (next: DutyState) => void;
    onDismiss?: () => void;
    activeStopCount?: number;
    testID?: string;
}) {
    const options: DutyState[] = ['on', 'break', 'off'];

    return (
        <Surface testID={testID ?? 'duty-sheet'} level="sheet" hero padding={space[4]} gap={space[3]}>
            <YStack gap={space[1]}>
                <Heading>Duty status</Heading>
                <Secondary>Tracking runs only while you are on duty.</Secondary>
            </YStack>

            {error ? <Banner tone="danger" message={error.message} /> : null}

            {duty !== 'off' && activeStopCount > 0 ? (
                <Banner
                    tone="warning"
                    message={`You still have ${activeStopCount} ${activeStopCount === 1 ? 'stop' : 'stops'} to complete`}
                />
            ) : null}

            <YStack gap={space[2]}>
                {options.map((option) => {
                    const selected = option === duty;
                    const unavailable = option === 'break' && !breakSupported;

                    return (
                        <XStack
                            key={option}
                            testID={`duty-option-${option}`}
                            alignItems="center"
                            gap={space[3]}
                            padding={space[3]}
                            borderRadius={radius.compact + 2}
                            borderWidth={selected ? 1.5 : 1}
                            borderColor={selected ? '$primary' : '$border'}
                            backgroundColor={selected ? '$primaryFill' : '$surface'}
                            opacity={unavailable ? 0.38 : 1}
                            pressStyle={unavailable ? undefined : { opacity: 0.7 }}
                            onPress={unavailable || isChanging ? undefined : () => onSelect(option)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected, disabled: unavailable || !!isChanging }}
                            accessibilityLabel={`${dutyLabel[option]}. ${unavailable ? 'Not available for this organisation.' : description[option]}`}
                        >
                            <YStack flex={1} gap={2}>
                                <Body fontWeight="700">{dutyLabel[option]}</Body>
                                <Micro>
                                    {unavailable ? 'Not available for this organisation yet' : description[option]}
                                </Micro>
                            </YStack>
                            {selected ? <Body tone="brand">✓</Body> : null}
                        </XStack>
                    );
                })}
            </YStack>

            {/* The backdrop is at the top of the screen; a driver holding the
                phone one-handed cannot reach it. Give the sheet its own exit. */}
            {onDismiss ? (
                <Button variant="ghost" onPress={onDismiss} testID="duty-sheet-cancel">
                    Cancel
                </Button>
            ) : null}
        </Surface>
    );
}

export default DutySheet;
