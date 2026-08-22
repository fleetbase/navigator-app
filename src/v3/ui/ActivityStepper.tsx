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
import { describeStatus, lifecycleRank } from '../theme/status';
import { radius, space } from '../theme/tokens';

export interface FlowActivity {
    /** Machine key, e.g. `driver_enroute`. Matches the order's status. */
    code: string;
    /** Organisation's label for the step. Used only as a fallback. */
    status?: string | null;
    details?: string | null;
    /** Marks a terminal activity. */
    complete?: boolean;
    require_pod?: boolean;
    pod_method?: string | null;
}

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

/**
 * Puts a config's activities into workflow order, and says whether it managed.
 *
 * `order-configs` returns activities as an unordered flat array with no
 * sequencing data at all — the dev instance's own config lists `completed`
 * before `dispatched`. Array position is therefore not progress, and treating
 * it as progress marked a freshly dispatched order as finished.
 *
 * When every code has a known place in the FleetOps lifecycle we can sort them
 * and speak about progress honestly. When even one does not — a bespoke
 * activity in a customer's flow — we have no basis for saying which steps are
 * behind the driver, and `ordered` is false so the caller stops claiming.
 */
export function sequenceFlow(flow: FlowActivity[]): { steps: FlowActivity[]; ordered: boolean } {
    const ranks = flow.map((a) => lifecycleRank(a.code));
    if (ranks.some((r) => r === undefined)) return { steps: flow, ordered: false };

    const steps = flow
        .map((activity, i) => ({ activity, rank: ranks[i] as number, i }))
        // Ties keep their original relative order, so a config with two
        // activities on the same rung renders in the order it declared them.
        .sort((a, b) => a.rank - b.rank || a.i - b.i)
        .map((entry) => entry.activity);
    return { steps, ordered: true };
}

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
            contentContainerStyle={{ gap: space[2], paddingRight: space[4] }}
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
/**
 * The step the driver should advance into, or `undefined` when there is none.
 *
 * Sequences the flow first. Reading the raw array meant a dispatched order —
 * last in its config's array — had no following entry, so the app declared it
 * complete and offered no way to move it on.
 */
export function nextActivity(flow: FlowActivity[], currentCode?: string | null): FlowActivity | undefined {
    const { steps } = sequenceFlow(flow);
    const i = steps.findIndex((a) => a.code === currentCode);
    if (i < 0) return steps[0];
    // Only the activity's own terminal flag ends the flow. "Nothing follows it
    // in the array" is not the same statement, and was the one being made.
    if (steps[i]?.complete) return undefined;
    return steps[i + 1];
}

/**
 * Whether the order has genuinely reached a terminal activity, as opposed to
 * merely sitting on the last entry of an unordered array.
 */
export function isTerminal(flow: FlowActivity[], currentCode?: string | null): boolean {
    const { steps } = sequenceFlow(flow);
    const current = steps.find((a) => a.code === currentCode);
    return Boolean(current?.complete);
}

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
