/**
 * Order activity stepper — a **dynamic renderer**, not a fixed sequence.
 *
 * The R1 order-detail frame drew a four-step CREATED → EN ROUTE → ARRIVED →
 * COMPLETED bar. Real Fleetbase flows are per-organisation: `order-configs`
 * returns an arbitrary ordered `flow`, and a pharmacy cold-chain config looks
 * nothing like a same-day courier one. Building to the mockup literally would
 * need rewriting for the first customer with a non-standard flow.
 *
 * So: any length. Two steps render as two; seven compress and scroll rather
 * than shrinking below a legible size. Colour comes from the status registry,
 * never from the config's `color` hint — the app owns its palette.
 */
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Micro } from './Text';
import { describeStatus } from '../theme/status';
import { sequenceFlow } from '../data/activityFlow';
import { radius, space } from '../theme/tokens';

import type { FlowActivity } from '../data/activityFlow';
export type { FlowActivity };
export { nextActivity, isTerminal, sequenceFlow, unresolvedLogic } from '../data/activityFlow';

export interface ActivityStepperProps {
    flow: FlowActivity[];
    /** The order's current status; matched against `flow[].code`. */
    currentCode?: string | null;
    /** Resolves a step's label. Registry wording wins over the config's. */
    labelFor: (activity: FlowActivity) => string;
    testID?: string;
}

/** Beyond this the row scrolls instead of squeezing steps below legibility. */
const COMPACT_AT = 4;

export function ActivityStepper({ flow, currentCode, labelFor, testID }: ActivityStepperProps) {
    if (!flow.length) return null;

    const { steps: flowSteps, ordered } = sequenceFlow(flow);
    const currentIndex = flowSteps.findIndex((a) => a.code === currentCode);
    const scrolls = flowSteps.length > COMPACT_AT;

    const steps = flowSteps.map((activity, i) => {
        // An unrecognised current status leaves every step "upcoming" rather
        // than falsely marking progress — and so does a flow we could not
        // sequence, where "before" has no meaning.
        const done = ordered && currentIndex >= 0 && i < currentIndex;
        const active = currentIndex >= 0 && i === currentIndex;
        const tone = done ? '$successText' : active ? '$primary' : '$surfaceRaised';

        return (
            <YStack
                key={activity.code}
                testID={`step-${activity.code}`}
                gap={space[1] + 2}
                flex={scrolls ? undefined : 1}
                width={scrolls ? 108 : undefined}
                accessibilityRole="text"
                accessibilityLabel={labelFor(activity)}
                accessibilityState={{ selected: active }}
            >
                <YStack height={4} borderRadius={2} backgroundColor={tone as never} />
                <Micro
                    fontSize={9.5}
                    tone={active ? 'primary' : 'muted'}
                    // Labels can be long in other languages; let them wrap
                    // rather than clipping a step the driver needs to read.
                    numberOfLines={2}
                >
                    {labelFor(activity)}
                </Micro>
            </YStack>
        );
    });

    if (!scrolls) {
        return (
            <XStack gap={space[2]} testID={testID}>
                {steps}
            </XStack>
        );
    }

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space[2], paddingEnd: space[4] }}
            testID={testID}
        >
            {steps}
        </ScrollView>
    );
}

/**
 * The next activity a driver can move to, or undefined at a terminal step.
 * Mirrors what `GET orders/{id}/next-activity` returns, but works offline.
 */
/** Pill showing that the next step will demand proof before it can complete. */
export function ProofRequiredHint({ label, testID }: { label: string; testID?: string }) {
    return (
        <XStack
            testID={testID}
            alignSelf="flex-start"
            paddingHorizontal={space[2]}
            paddingVertical={3}
            borderRadius={radius.pill}
            borderWidth={1}
            borderColor="$warningBorder"
            backgroundColor="$warningFill"
        >
            <Micro tone="warning" fontSize={10.5}>
                {label}
            </Micro>
        </XStack>
    );
}

export { describeStatus };
