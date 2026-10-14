/**
 * The flow is a directed graph, and the app has to walk it the way FleetOps
 * does. These cases are written against the documented model — `activities`,
 * `sequence`, `logic`, `complete` — not against the flattened shape the public
 * API happens to emit today.
 */
import { sequenceFlow, nextActivity, isTerminal, hasGraph, unresolvedLogic, type FlowActivity } from '../activityFlow';

/** A graph config: created → dispatched → enroute → {completed | failed}. */
const graph: FlowActivity[] = [
    { code: 'created', activities: ['dispatched'] },
    { code: 'dispatched', activities: ['enroute'] },
    { code: 'enroute', activities: ['completed', 'failed'] },
    { code: 'completed', complete: true, activities: [] },
    { code: 'failed', sequence: 2, activities: [] },
];

/** What the public API actually sends today: the same flow, graph stripped. */
const flattened: FlowActivity[] = [
    { code: 'created' },
    { code: 'enroute' },
    { code: 'started' },
    { code: 'completed', complete: true },
    { code: 'dispatched' },
];

describe('hasGraph', () => {
    it('recognises a payload carrying transitions', () => {
        expect(hasGraph(graph)).toBe(true);
    });

    it('recognises the flattened projection the public API sends', () => {
        expect(hasGraph(flattened)).toBe(false);
    });
});

describe('sequenceFlow, with the graph', () => {
    it('walks transitions rather than array order', () => {
        // Declared order already matches here; the point is that it is derived.
        const { steps, shape, ordered } = sequenceFlow(graph);
        expect(shape).toBe('graph');
        expect(ordered).toBe(true);
        expect(steps.map((s) => s.code)).toEqual(['created', 'dispatched', 'enroute', 'completed', 'failed']);
    });

    it('starts from the activity nothing transitions into, whatever the array order', () => {
        const shuffled = [graph[3], graph[2], graph[0], graph[4], graph[1]];
        expect(sequenceFlow(shuffled).steps[0].code).toBe('created');
    });

    it('orders siblings by sequence, not by declaration', () => {
        const branch: FlowActivity[] = [
            { code: 'arrived', activities: ['failed', 'completed'] },
            { code: 'failed', sequence: 2 },
            { code: 'completed', sequence: 1, complete: true },
        ];
        // `completed` is declared second but sequenced first.
        expect(sequenceFlow(branch).steps.map((s) => s.code)).toEqual(['arrived', 'completed', 'failed']);
    });

    it('keeps an activity nothing reaches rather than hiding it', () => {
        const orphan = [...graph, { code: 'canceled' }];
        expect(sequenceFlow(orphan).steps.map((s) => s.code)).toContain('canceled');
    });

    it('terminates on a cycle instead of walking forever', () => {
        const cyclic: FlowActivity[] = [
            { code: 'a', activities: ['b'] },
            { code: 'b', activities: ['a'] },
        ];
        expect(sequenceFlow(cyclic).steps.map((s) => s.code)).toEqual(['a', 'b']);
    });
});

describe('sequenceFlow, without the graph', () => {
    it('falls back to the canonical lifecycle', () => {
        const { steps, shape, ordered } = sequenceFlow(flattened);
        expect(shape).toBe('lifecycle');
        expect(ordered).toBe(true);
        expect(steps.map((s) => s.code)).toEqual(['created', 'dispatched', 'enroute', 'started', 'completed']);
    });

    it('admits it does not know the order when an activity is unrecognised', () => {
        const bespoke = [...flattened, { code: 'awaiting_customs_clearance' }];
        const { ordered, shape } = sequenceFlow(bespoke);
        expect(shape).toBe('lifecycle');
        expect(ordered).toBe(false);
    });
});

describe('nextActivity', () => {
    it('takes the first child in sequence order', () => {
        expect(nextActivity(graph, 'enroute')?.code).toBe('completed');
    });

    it('offers nothing at a terminal activity', () => {
        expect(nextActivity(graph, 'completed')).toBeUndefined();
    });

    it('starts at the root when the order has no status yet', () => {
        expect(nextActivity(graph, undefined)?.code).toBe('created');
    });

    it('does not treat the end of the array as the end of the flow', () => {
        // `dispatched` is last in the flattened payload but not terminal.
        expect(nextActivity(flattened, 'dispatched')?.code).toBe('enroute');
    });
});

describe('unresolvedLogic', () => {
    it('is true when a branch is gated by conditions the app cannot evaluate', () => {
        const gated: FlowActivity[] = [
            { code: 'arrived', activities: ['completed', 'failed'] },
            { code: 'completed', complete: true },
            { code: 'failed', logic: [{ type: 'and', conditions: [] }] },
        ];
        expect(unresolvedLogic(gated, 'arrived')).toBe(true);
    });

    it('is false when there is only one way forward, gated or not', () => {
        expect(unresolvedLogic(graph, 'dispatched')).toBe(false);
    });

    it('is false for a payload with no graph at all', () => {
        expect(unresolvedLogic(flattened, 'dispatched')).toBe(false);
    });
});

describe('isTerminal', () => {
    it('reads the activity\'s own flag', () => {
        expect(isTerminal(graph, 'completed')).toBe(true);
        expect(isTerminal(graph, 'enroute')).toBe(false);
        expect(isTerminal(flattened, 'dispatched')).toBe(false);
    });
});
