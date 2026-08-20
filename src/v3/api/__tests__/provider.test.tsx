import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { FleetbaseProvider, useFleetbase, useQueue } from '../FleetbaseProvider';
import { MutationQueue, setIdFactory } from '../queue';
import { clearV3 } from '../storage';

let n = 0;
beforeEach(() => {
    clearV3();
    n = 0;
    setIdFactory(() => `id_${++n}`);
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve({}),
    });
});

function mount(node: React.ReactNode) {
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => { tree = ReactTestRenderer.create(<>{node}</>); });
    // @ts-expect-error assigned inside act
    return tree;
}

describe('FleetbaseProvider', () => {
    it('hands every consumer the same instance', () => {
        const seen: unknown[] = [];
        const Probe = () => { seen.push(useFleetbase()); return null; };
        const t = mount(
            <FleetbaseProvider host="https://x.test"><Probe /><Probe /><Probe /></FleetbaseProvider>
        );
        expect(seen).toHaveLength(3);
        expect(seen[0]).toBe(seen[1]);
        expect(seen[1]).toBe(seen[2]);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('keeps the adapter identity stable across a token change — v2 refetched everything here', () => {
        const adapters: unknown[] = [];
        const Probe = () => { adapters.push(useFleetbase().adapter); return null; };

        let tree: ReactTestRenderer.ReactTestRenderer;
        ReactTestRenderer.act(() => {
            tree = ReactTestRenderer.create(
                <FleetbaseProvider host="https://x.test" userToken="token_a"><Probe /></FleetbaseProvider>
            );
        });
        // Simulate login / organisation switch issuing a new driver token.
        ReactTestRenderer.act(() => {
            tree!.update(
                <FleetbaseProvider host="https://x.test" userToken="token_b"><Probe /></FleetbaseProvider>
            );
        });

        expect(adapters.length).toBeGreaterThanOrEqual(2);
        expect(adapters[0]).toBe(adapters[adapters.length - 1]);
        ReactTestRenderer.act(() => tree!.unmount());
    });

    it('applies the new credential to subsequent requests', async () => {
        const Probe = ({ onReady }: { onReady: (v: ReturnType<typeof useFleetbase>) => void }) => {
            const v = useFleetbase();
            React.useEffect(() => onReady(v), [v, onReady]);
            return null;
        };
        let ctx: ReturnType<typeof useFleetbase> | null = null;

        let tree: ReactTestRenderer.ReactTestRenderer;
        ReactTestRenderer.act(() => {
            tree = ReactTestRenderer.create(
                <FleetbaseProvider host="https://x.test" userToken="token_a">
                    <Probe onReady={(v) => { ctx = v; }} />
                </FleetbaseProvider>
            );
        });
        ReactTestRenderer.act(() => {
            tree!.update(
                <FleetbaseProvider host="https://x.test" userToken="token_b">
                    <Probe onReady={(v) => { ctx = v; }} />
                </FleetbaseProvider>
            );
        });

        await ReactTestRenderer.act(async () => { await ctx!.adapter.get('orders'); });

        const fetchMock = (globalThis as unknown as { fetch: jest.Mock }).fetch;
        const init = fetchMock.mock.calls.at(-1)![1] as { headers: Headers };
        expect(init.headers.get('Authorization')).toBe('Bearer token_b');
        ReactTestRenderer.act(() => tree!.unmount());
    });

    it('flushes the queue when connectivity returns', async () => {
        const queue = new MutationQueue();
        queue.enqueue({ method: 'POST', path: 'orders/1/complete', label: 'Complete stop' });

        let tree: ReactTestRenderer.ReactTestRenderer;
        await ReactTestRenderer.act(async () => {
            tree = ReactTestRenderer.create(
                <FleetbaseProvider host="https://x.test" queue={queue} isConnected={false}>
                    <></>
                </FleetbaseProvider>
            );
        });
        expect(queue.snapshot().pendingCount).toBe(1);

        await ReactTestRenderer.act(async () => {
            tree!.update(
                <FleetbaseProvider host="https://x.test" queue={queue} isConnected>
                    <></>
                </FleetbaseProvider>
            );
        });
        await ReactTestRenderer.act(async () => { await Promise.resolve(); });

        expect(queue.snapshot().pendingCount).toBe(0);
        ReactTestRenderer.act(() => tree!.unmount());
    });

    it('useQueue returns a stable snapshot when nothing changed', () => {
        const queue = new MutationQueue();
        const snaps: unknown[] = [];
        const Probe = () => { snaps.push(useQueue(queue)); return null; };
        let tree: ReactTestRenderer.ReactTestRenderer;
        ReactTestRenderer.act(() => { tree = ReactTestRenderer.create(<Probe />); });
        ReactTestRenderer.act(() => { tree!.update(<Probe />); });
        expect(snaps[0]).toBe(snaps[snaps.length - 1]);
        ReactTestRenderer.act(() => tree!.unmount());
    });

    it('useQueue tracks the pending count for the offline banner', () => {
        const queue = new MutationQueue();
        let latest = 0;
        const Probe = () => { latest = useQueue(queue).pendingCount; return null; };
        const t = mount(<Probe />);
        ReactTestRenderer.act(() => { queue.enqueue({ method: 'POST', path: 'a', label: 'a' }); });
        expect(latest).toBe(1);
        ReactTestRenderer.act(() => t.unmount());
    });
});
