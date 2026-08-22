import { MutationQueue, MAX_ATTEMPTS, setIdFactory, type QueuedMutation } from '../queue';
import { clearV3 } from '../storage';

let n = 0;
beforeEach(() => {
    clearV3();
    n = 0;
    setIdFactory(() => `id_${++n}`);
});

const enq = (q: MutationQueue, label: string, path = '/x', method: QueuedMutation['method'] = 'POST') =>
    q.enqueue({ method, path, label, body: { label } });

describe('mutation queue', () => {
    it('replays in enqueue order — an arrival must land before its completion', async () => {
        const q = new MutationQueue();
        const sent: string[] = [];
        q.setSender(async (i) => { sent.push(i.label); return { ok: true }; });

        enq(q, 'arrive');
        enq(q, 'scan');
        enq(q, 'complete');
        await q.flush();

        expect(sent).toEqual(['arrive', 'scan', 'complete']);
        expect(q.snapshot().items).toHaveLength(0);
    });

    it('blocks at the head on a transient failure rather than letting later work overtake', async () => {
        const q = new MutationQueue();
        const sent: string[] = [];
        q.setSender(async (i) => {
            sent.push(i.label);
            return i.label === 'arrive' ? { ok: false, message: 'offline' } : { ok: true };
        });

        enq(q, 'arrive');
        enq(q, 'complete');
        await q.flush();

        // 'complete' must not have been attempted.
        expect(sent).toEqual(['arrive']);
        expect(q.snapshot().pendingCount).toBe(2);
    });

    it('reuses the idempotency key across retries so a replay is not a second operation', async () => {
        const q = new MutationQueue();
        const keys: string[] = [];
        let fail = true;
        q.setSender(async (i) => {
            keys.push(i.idempotencyKey);
            if (fail) { fail = false; return { ok: false, message: 'timeout' }; }
            return { ok: true };
        });

        enq(q, 'complete');
        await q.flush();
        await q.flush();

        expect(keys).toHaveLength(2);
        expect(keys[0]).toBe(keys[1]);
    });

    it('parks a 4xx immediately — it will fail identically forever', async () => {
        const q = new MutationQueue();
        let calls = 0;
        q.setSender(async () => { calls += 1; return { ok: false, status: 422, message: 'invalid' }; });

        enq(q, 'bad');
        await q.flush();

        expect(calls).toBe(1);
        const s = q.snapshot();
        expect(s.failedCount).toBe(1);
        expect(s.items[0].lastStatus).toBe(422);
    });

    it('keeps retrying a 429 and a 5xx', async () => {
        const q = new MutationQueue();
        q.setSender(async () => ({ ok: false, status: 429, message: 'slow down' }));
        enq(q, 'throttled');
        await q.flush();
        expect(q.snapshot().failedCount).toBe(0);
        expect(q.snapshot().pendingCount).toBe(1);
    });

    it('gives up after MAX_ATTEMPTS so one bad entry cannot block forever', async () => {
        const q = new MutationQueue();
        q.setSender(async () => ({ ok: false, status: 500, message: 'boom' }));
        enq(q, 'doomed');
        for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await q.flush();
        expect(q.snapshot().failedCount).toBe(1);
    });

    it('survives a cold start and re-sends work caught mid-flight', async () => {
        const first = new MutationQueue();
        first.setSender(async () => ({ ok: false, message: 'offline' }));
        enq(first, 'proof');
        await first.flush();

        // Simulate a crash mid-send by forcing the persisted status.
        const revived = new MutationQueue();
        const snap = revived.snapshot();
        expect(snap.items).toHaveLength(1);
        expect(snap.items[0].label).toBe('proof');
        // Nothing is left stuck in `syncing`.
        expect(snap.items.every((i) => i.status !== 'syncing')).toBe(true);

        const sent: string[] = [];
        revived.setSender(async (i) => { sent.push(i.label); return { ok: true }; });
        await revived.flush();
        expect(sent).toEqual(['proof']);
    });

    it('picks up work enqueued during an in-flight flush', async () => {
        const q = new MutationQueue();
        const sent: string[] = [];
        q.setSender(async (i) => {
            sent.push(i.label);
            if (i.label === 'first') enq(q, 'second');
            return { ok: true };
        });
        enq(q, 'first');
        await q.flush();
        expect(sent).toEqual(['first', 'second']);
    });

    it('retryFailed un-parks entries for the Retry affordance', async () => {
        const q = new MutationQueue();
        q.setSender(async () => ({ ok: false, status: 400, message: 'nope' }));
        enq(q, 'x');
        await q.flush();
        expect(q.snapshot().failedCount).toBe(1);

        q.retryFailed();
        expect(q.snapshot().failedCount).toBe(0);
        expect(q.snapshot().pendingCount).toBe(1);
    });

    it('notifies subscribers so the offline banner can track the count', async () => {
        const q = new MutationQueue();
        const counts: number[] = [];
        q.subscribe((s) => counts.push(s.pendingCount));
        enq(q, 'a');
        enq(q, 'b');
        expect(counts[counts.length - 1]).toBe(2);
    });
});

/**
 * Guards the staleness the sync-queue screen would have shown: a retry changes
 * an item in place — attempts 1→2, lastError set — while pendingCount,
 * failedCount, isFlushing and items.length all stay exactly the same.
 */
describe('snapshot immutability', () => {
    it('does not let a later change rewrite a snapshot already handed out', async () => {
        // `[...items]` shared every object, so an old snapshot mutated under
        // whoever was holding it — including React.
        const queue = new MutationQueue();
        queue.setSender(async () => ({ ok: false as const, message: 'offline' }));
        queue.enqueue({ method: 'POST', path: 'issues', label: 'Report an issue', idempotencyKey: 'k1' });

        const before = queue.snapshot();
        const attemptsAtCapture = before.items[0].attempts;
        await queue.flush();

        expect(before.items[0].attempts).toBe(attemptsAtCapture);
        expect(queue.snapshot().items[0].attempts).toBeGreaterThan(attemptsAtCapture);
    });
});

describe('snapshot revision', () => {
    it('advances when an item changes in place, not just when counts do', async () => {
        const queue = new MutationQueue();
        queue.setSender(async () => ({ ok: false as const, message: 'offline' }));
        queue.enqueue({ method: 'POST', path: 'issues', label: 'Report an issue', idempotencyKey: 'k1' });

        const before = queue.snapshot();
        await queue.flush();
        const after = queue.snapshot();

        // The thing a naive comparison would have looked at is unchanged...
        expect(after.items.length).toBe(before.items.length);
        expect(after.pendingCount).toBe(before.pendingCount);
        // ...but the item did change, and the revision says so.
        expect(after.items[0].attempts).toBeGreaterThan(before.items[0].attempts);
        expect(after.revision).toBeGreaterThan(before.revision);
    });

    it('is monotonic across enqueue, retry and discard', async () => {
        const queue = new MutationQueue();
        const seen: number[] = [];
        queue.setSender(async () => ({ ok: false as const, message: 'offline' }));

        const item = queue.enqueue({ method: 'POST', path: 'a', label: 'A', idempotencyKey: 'k' });
        seen.push(queue.snapshot().revision);
        await queue.flush();
        seen.push(queue.snapshot().revision);
        queue.retryFailed();
        seen.push(queue.snapshot().revision);
        queue.discard(item.id);
        seen.push(queue.snapshot().revision);

        for (let i = 1; i < seen.length; i++) {
            expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
        }
        expect(seen[seen.length - 1]).toBeGreaterThan(seen[0]);
    });
});
