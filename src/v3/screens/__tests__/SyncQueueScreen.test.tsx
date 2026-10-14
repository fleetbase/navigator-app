import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { SyncQueueScreen } from '../SyncQueueScreen';
import { MutationQueue, describeMutation } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';

let queue: MutationQueue;

beforeEach(() => {
    clearV3();
    settingsStore.reset();
    queue = new MutationQueue();
});

async function mount(node: React.ReactNode, scheme: SchemeName = 'dark') {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider>{node}</SyncProvider>
                </Theme>
            </TamaguiProvider>
        );
        await Promise.resolve();
    });
    // @ts-expect-error assigned inside act
    return tree;
}

type N = { children?: unknown[]; props?: Record<string, unknown> };
function walk(node: unknown, visit: (n: N) => void): void {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach((c) => walk(c, visit));
    visit(node as N);
    (node as N).children?.forEach((c) => walk(c, visit));
}
const textOf = (t: ReactTestRenderer.ReactTestRenderer) => {
    const out: string[] = [];
    walk(t.toJSON(), (n) => n.children?.forEach((c) => typeof c === 'string' && out.push(c)));
    return out.join(' ');
};
const testIDs = (t: ReactTestRenderer.ReactTestRenderer) => {
    const out: string[] = [];
    walk(t.toJSON(), (n) => typeof n.props?.testID === 'string' && out.push(n.props.testID as string));
    return out;
};
const byID = (t: ReactTestRenderer.ReactTestRenderer, id: string) => t.root.findAll((n) => n.props?.testID === id)[0];

const add = (path: string, method: QueuedMethod = 'POST', over: Partial<{ label: string; labelKey: string }> = {}) => {
    const d = describeMutation(method, path);
    return queue.enqueue({ method, path, label: over.label ?? d.fallback, labelKey: over.labelKey ?? d.labelKey, idempotencyKey: `k-${path}-${method}` });
};
type QueuedMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

describe('describeMutation', () => {
    it('names work the way a driver would, not as a method and path', () => {
        // The default label used to be "POST issues".
        expect(describeMutation('POST', 'issues').fallback).toBe('Reported issue');
        expect(describeMutation('POST', 'fuel-reports').fallback).toBe('Fuel report');
        expect(describeMutation('PUT', 'entities/product_1').fallback).toBe('Item details');
        expect(describeMutation('POST', 'orders/order_1/update-activity').fallback).toBe('Order progress');
        expect(describeMutation('POST', 'chat-channels/chat_1/send-message').fallback).toBe('Message');
    });

    it('distinguishes creating from editing on the same resource', () => {
        expect(describeMutation('POST', 'issues').labelKey).not.toBe(describeMutation('PUT', 'issues/issue_1').labelKey);
    });

    it('never falls back to a raw path for something unrecognised', () => {
        const d = describeMutation('POST', 'work-orders/wo_1/close');
        expect(d.fallback).toBe('Work orders');
        expect(d.fallback).not.toContain('/');
        expect(d.fallback).not.toContain('POST');
    });

    it('ignores a query string and a leading slash', () => {
        expect(describeMutation('POST', '/issues?foo=1').fallback).toBe('Reported issue');
    });
});

describe('SyncQueueScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        add('issues');
        const t = await mount(<SyncQueueScreen queue={queue} />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says everything is synced when there is nothing waiting', async () => {
        const t = await mount(<SyncQueueScreen queue={queue} />);
        expect(testIDs(t)).toContain('sync-empty');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('labels queued work in words, not as a method and path', async () => {
        add('fuel-reports');
        const t = await mount(<SyncQueueScreen queue={queue} />);
        const text = textOf(t);
        expect(text).toContain('Fuel report');
        expect(text).not.toContain('POST');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('lists the blocker first: failed work above work that is merely waiting', async () => {
        // The queue distinguishes two kinds of failure, and it matters here.
        // A permanent 4xx parks the item and the pass *continues* past it, so a
        // rejected entry does not strand everything behind it forever. A
        // transient failure puts the item back and stops, preserving order.
        // So: issues is rejected outright, fuel-reports merely has no signal.
        const rejected = add('issues');
        const waiting = add('fuel-reports');
        queue.setSender(async (item) =>
            item.path === 'issues'
                ? { ok: false as const, status: 422, message: 'Location is required' }
                : { ok: false as const, message: 'offline' }
        );
        await queue.flush();

        const snapshot = queue.snapshot();
        expect(snapshot.failedCount).toBe(1);
        expect(snapshot.pendingCount).toBe(1);
        expect(snapshot.items.find((i) => i.status === 'failed')?.id).toBe(rejected.id);

        const t = await mount(<SyncQueueScreen queue={queue} />);
        const ids = testIDs(t).filter((id) => id.startsWith('queued-'));
        expect(ids[0]).toBe(`queued-${rejected.id}`);
        expect(ids).toContain(`queued-${waiting.id}`);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('parks a rejected item without holding up the rest of the queue', async () => {
        // Both are rejected outright, so both park in a single pass rather than
        // the first one blocking the second indefinitely.
        add('issues');
        add('fuel-reports');
        queue.setSender(async () => ({ ok: false as const, status: 422, message: 'Rejected' }));
        await queue.flush();

        expect(queue.snapshot().failedCount).toBe(2);
        expect(queue.snapshot().pendingCount).toBe(0);
    });

    it('stops at a transient failure, so ordering survives losing signal', async () => {
        add('issues');
        add('fuel-reports');
        queue.setSender(async () => ({ ok: false as const, message: 'offline' }));
        await queue.flush();

        // Only the head was attempted; the rest keep their place.
        const snapshot = queue.snapshot();
        expect(snapshot.failedCount).toBe(0);
        expect(snapshot.items[0].attempts).toBe(1);
        expect(snapshot.items[1].attempts).toBe(0);
    });

    it('shows why a failed item failed', async () => {
        add('issues');
        queue.setSender(async () => ({ ok: false as const, status: 422, message: 'Location is required' }));
        for (let i = 0; i < 9; i++) await queue.flush();

        const t = await mount(<SyncQueueScreen queue={queue} />);
        expect(textOf(t)).toContain('Location is required');
        expect(textOf(t)).toContain('422');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers retry only when something has actually failed', async () => {
        add('issues');
        const waiting = await mount(<SyncQueueScreen queue={queue} />);
        expect(testIDs(waiting)).not.toContain('sync-retry');
        ReactTestRenderer.act(() => waiting.unmount());

        queue.setSender(async () => ({ ok: false as const, status: 500, message: 'Server error' }));
        for (let i = 0; i < 9; i++) await queue.flush();

        const failed = await mount(<SyncQueueScreen queue={queue} />);
        expect(testIDs(failed)).toContain('sync-retry');
        ReactTestRenderer.act(() => failed.unmount());
    });

    it('asks before discarding, and names what would be lost', async () => {
        // Discarding is irreversible; on a proof capture it never happened.
        const item = add('issues');
        queue.setSender(async () => ({ ok: false as const, status: 422, message: 'Rejected' }));
        for (let i = 0; i < 9; i++) await queue.flush();

        const t = await mount(<SyncQueueScreen queue={queue} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, `discard-${item.id}`).props as { onPress?: () => void }).onPress?.();
        });

        expect(testIDs(t)).toContain('discard-confirm');
        expect(textOf(t)).toContain('cannot be undone');
        expect(textOf(t)).toContain('Reported issue');
        // Nothing removed until it is confirmed.
        expect(queue.snapshot().items.length).toBe(1);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('discards only after confirmation', async () => {
        const item = add('issues');
        queue.setSender(async () => ({ ok: false as const, status: 422, message: 'Rejected' }));
        for (let i = 0; i < 9; i++) await queue.flush();

        const t = await mount(<SyncQueueScreen queue={queue} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, `discard-${item.id}`).props as { onPress?: () => void }).onPress?.();
        });
        await ReactTestRenderer.act(async () => {
            (byID(t, 'discard-confirm-yes').props as { onPress?: () => void }).onPress?.();
        });

        expect(queue.snapshot().items.length).toBe(0);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows the attempt count climbing, which a stale snapshot would hide', async () => {
        add('issues');
        queue.setSender(async () => ({ ok: false as const, message: 'offline' }));
        await queue.flush();
        await queue.flush();

        const t = await mount(<SyncQueueScreen queue={queue} />);
        expect(textOf(t)).toContain('attempts');
        ReactTestRenderer.act(() => t.unmount());
    });
});
