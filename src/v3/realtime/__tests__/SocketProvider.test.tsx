/**
 * The connection must reach subscribers that mounted before it existed.
 *
 * The socket is created in the provider's effect, which runs after its
 * children's. The driver channel subscribed on mount, found no socket, got a
 * no-op, and never asked again — so realtime was silently off even once a
 * socket config was passed.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SocketProvider } from '../SocketProvider';
import { useDriverChannel } from '../useDriverChannel';
import { orderStore } from '../../data/orderStore';
import { clearV3 } from '../../api/storage';

type Pending = { resolve: (v: { value?: unknown; done?: boolean }) => void };

const subscriptions: { name: string; queue: Pending[]; push: (value: unknown) => void }[] = [];

jest.mock('socketcluster-client', () => ({
    __esModule: true,
    default: {
        create: () => ({
            subscribe: (name: string) => {
                const waiting: Pending[] = [];
                const buffered: unknown[] = [];
                const entry = {
                    name,
                    queue: waiting,
                    push: (value: unknown) => {
                        const next = waiting.shift();
                        if (next) next.resolve({ value, done: false });
                        else buffered.push(value);
                    },
                };
                subscriptions.push(entry);
                return {
                    next: () =>
                        buffered.length
                            ? Promise.resolve({ value: buffered.shift(), done: false })
                            : new Promise((resolve) => waiting.push({ resolve })),
                    unsubscribe: () => undefined,
                    close: () => undefined,
                };
            },
            // Lifecycle never fires in the test; `once` stays pending.
            listener: () => ({ once: () => new Promise(() => undefined) }),
            disconnect: () => undefined,
        }),
    },
}));

function Driver({ id }: { id: string }) {
    useDriverChannel(id);
    return null;
}

beforeEach(() => {
    subscriptions.length = 0;
    clearV3();
    orderStore.clear();
});

describe('SocketProvider', () => {
    it('subscribes a child that mounted before the socket existed', async () => {
        let tree: ReactTestRenderer.ReactTestRenderer | undefined;
        await ReactTestRenderer.act(async () => {
            tree = ReactTestRenderer.create(
                <SocketProvider config={{ hostname: 'socket.test', port: 8000 }}>
                    <Driver id="driver_me" />
                </SocketProvider>
            );
        });
        expect(subscriptions.map((s) => s.name)).toContain('driver.driver_me');
        await ReactTestRenderer.act(async () => tree?.unmount());
    });

    it('delivers an unassignment to the store', async () => {
        orderStore.upsert({ id: 'order_1', status: 'driver_enroute' });
        let tree: ReactTestRenderer.ReactTestRenderer | undefined;
        await ReactTestRenderer.act(async () => {
            tree = ReactTestRenderer.create(
                <SocketProvider config={{ hostname: 'socket.test' }}>
                    <Driver id="driver_me" />
                </SocketProvider>
            );
        });
        const channel = subscriptions.find((s) => s.name === 'driver.driver_me');
        await ReactTestRenderer.act(async () => {
            channel?.push({ event: 'order.driver_unassigned', data: { id: 'order_1' } });
            await Promise.resolve();
        });
        expect(orderStore.get('order_1')).toBeUndefined();
        expect(orderStore.removalOf('order_1')).toBe('reassigned');
        await ReactTestRenderer.act(async () => tree?.unmount());
    });

    it('stays off without a host', async () => {
        let tree: ReactTestRenderer.ReactTestRenderer | undefined;
        await ReactTestRenderer.act(async () => {
            tree = ReactTestRenderer.create(
                <SocketProvider config={undefined} enabled={false}>
                    <Driver id="driver_me" />
                </SocketProvider>
            );
        });
        expect(subscriptions).toHaveLength(0);
        await ReactTestRenderer.act(async () => tree?.unmount());
    });
});
