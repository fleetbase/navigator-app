/**
 * Order activity sequencer.
 *
 * A config's flow is a **directed graph**, not a list. Each activity carries:
 *
 *   - `activities` — the codes it can transition to
 *   - `sequence`   — orders activities reachable from the same parent
 *   - `logic`      — and/or/not condition blocks gating availability
 *   - `complete`   — marks a terminal activity; any code may carry it
 *
 * FleetOps walks exactly this on the server (`OrderConfig::nextActivity` →
 * `Activity::getNext`, which expands `activities` and keeps the children whose
 * `logic` passes). The app has to do the same to render progress or offer the
 * next step.
 *
 * The catch is that the public `order-configs` resource currently projects the
 * flow down to `code`, `status`, `details`, `color`, `complete`, `pod_method`
 * and `require_pod` — `activities`, `sequence` and `logic` are stripped before
 * the app sees them (see O-17). So this module has two modes, and reports which
 * one it used rather than pretending they are equivalent:
 *
 *   - **graph** — the payload carries `activities`; traverse it properly.
 *   - **lifecycle** — it does not; fall back to the canonical FleetOps order.
 *     Correct for standard flows, and silent about bespoke activities it has
 *     never heard of, which is the honest position.
 */
import { lifecycleRank } from '../theme/status';

export interface FlowActivity {
    code: string;
    status?: string | null;
    details?: string | null;
    complete?: boolean;
    require_pod?: boolean;
    pod_method?: string | null;
    /** Codes this activity can transition to. Absent on the public payload. */
    activities?: string[] | null;
    /** Orders siblings reachable from the same parent. */
    sequence?: number | null;
    /** Conditions gating availability. Not evaluated here — see `unresolved`. */
    logic?: unknown;
}

export type FlowShape = 'graph' | 'lifecycle';

export interface SequencedFlow {
    /** The activities in the order a driver moves through them. */
    steps: FlowActivity[];
    shape: FlowShape;
    /**
     * Whether the order of `steps` is something we actually know. False when
     * the payload carries no graph *and* some code has no lifecycle rank —
     * at which point the caller must stop claiming which steps are behind the
     * driver.
     */
    ordered: boolean;
}

const bySequence = (a: FlowActivity, b: FlowActivity) => (a.sequence ?? 0) - (b.sequence ?? 0);

/** Does this payload carry the transition graph at all? */
export function hasGraph(flow: FlowActivity[]): boolean {
    return flow.some((a) => Array.isArray(a.activities) && a.activities.length > 0);
}

/**
 * The activity the flow starts from: the one nothing else transitions into.
 * A cycle would leave no such root, so the first entry is the last resort.
 */
function rootOf(flow: FlowActivity[]): FlowActivity | undefined {
    const reachable = new Set<string>();
    for (const activity of flow) for (const code of activity.activities ?? []) reachable.add(code);
    const roots = flow.filter((a) => !reachable.has(a.code)).sort(bySequence);
    return roots[0] ?? flow[0];
}

/**
 * Flatten the graph into the path a driver takes.
 *
 * Depth-first from the root, siblings in `sequence` order, each activity
 * emitted once. Branches (a failure path beside the happy one) therefore
 * appear after the branch point rather than being dropped — a driver should
 * see that an exception step exists.
 */
function walkGraph(flow: FlowActivity[]): FlowActivity[] {
    const byCode = new Map(flow.map((a) => [a.code, a]));
    const seen = new Set<string>();
    const out: FlowActivity[] = [];

    const visit = (activity?: FlowActivity) => {
        if (!activity || seen.has(activity.code)) return;
        seen.add(activity.code);
        out.push(activity);
        const children = (activity.activities ?? [])
            .map((code) => byCode.get(code))
            .filter((a): a is FlowActivity => Boolean(a))
            .sort(bySequence);
        for (const child of children) visit(child);
    };

    visit(rootOf(flow));
    // Anything unreachable from the root still belongs to the config; append it
    // rather than hiding it, in its own declared order.
    for (const activity of flow) visit(activity);
    return out;
}

export function sequenceFlow(flow: FlowActivity[]): SequencedFlow {
    if (!flow.length) return { steps: flow, shape: 'lifecycle', ordered: false };

    if (hasGraph(flow)) {
        return { steps: walkGraph(flow), shape: 'graph', ordered: true };
    }

    const ranks = flow.map((a) => lifecycleRank(a.code));
    if (ranks.some((r) => r === undefined)) return { steps: flow, shape: 'lifecycle', ordered: false };

    const steps = flow
        .map((activity, i) => ({ activity, rank: ranks[i] as number, i }))
        // Ties keep their declared order.
        .sort((a, b) => a.rank - b.rank || a.i - b.i)
        .map((entry) => entry.activity);
    return { steps, shape: 'lifecycle', ordered: true };
}

/**
 * The step to advance into, or `undefined` when there is none.
 *
 * With the graph, this is the current activity's first child in `sequence`
 * order — the same choice `nextFirstActivity()` makes server-side. Without it,
 * the next entry in the sequenced list.
 *
 * `logic` is deliberately **not** evaluated here: the conditions are expressed
 * against the server's own order model, and guessing at them client-side would
 * offer a driver a step the server will refuse. When an activity carries logic
 * the app should be asking `GET /v1/orders/{id}/next-activity` instead — see
 * `unresolvedLogic`.
 */
export function nextActivity(flow: FlowActivity[], currentCode?: string | null): FlowActivity | undefined {
    if (!flow.length) return undefined;

    if (hasGraph(flow)) {
        const byCode = new Map(flow.map((a) => [a.code, a]));
        const current = currentCode ? byCode.get(currentCode) : undefined;
        if (!current) return rootOf(flow);
        if (current.complete) return undefined;
        const children = (current.activities ?? [])
            .map((code) => byCode.get(code))
            .filter((a): a is FlowActivity => Boolean(a))
            .sort(bySequence);
        return children[0];
    }

    const { steps } = sequenceFlow(flow);
    const i = steps.findIndex((a) => a.code === currentCode);
    if (i < 0) return steps[0];
    // Only the activity's own terminal flag ends the flow. "Nothing follows it
    // in the array" is a different statement, and was the one being made.
    if (steps[i]?.complete) return undefined;
    return steps[i + 1];
}

/**
 * Whether the choice of next step depends on `logic` the app cannot evaluate.
 *
 * True when the current activity has more than one candidate child and any of
 * them is conditional. The screen should defer to the server rather than pick.
 */
export function unresolvedLogic(flow: FlowActivity[], currentCode?: string | null): boolean {
    if (!hasGraph(flow)) return false;
    const byCode = new Map(flow.map((a) => [a.code, a]));
    const current = currentCode ? byCode.get(currentCode) : undefined;
    const children = (current?.activities ?? []).map((code) => byCode.get(code)).filter(Boolean) as FlowActivity[];
    if (children.length < 2) return false;
    return children.some((child) => child.logic != null && (!Array.isArray(child.logic) || child.logic.length > 0));
}

/** Whether the order has reached an activity that ends the flow. */
export function isTerminal(flow: FlowActivity[], currentCode?: string | null): boolean {
    const current = flow.find((a) => a.code === currentCode);
    return Boolean(current?.complete);
}
