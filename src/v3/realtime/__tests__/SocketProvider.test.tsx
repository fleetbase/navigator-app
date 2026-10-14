/**
 * The connection must reach subscribers that mounted before it existed.
 *
 * The socket is created in the provider's effect, which runs after its
 * children's. The driver channel subscribed on mount, found no socket, got a
 * no-op, and never asked again — so realtime was silently off even once a
 * socket config was passed.
 *
 * It must also connect as the driver: a socket token in the handshake, kept
 * fresh, recovered after the server drops it, and anonymous when there is no
 * driver or the server predates socket auth.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SocketProvider, type SocketAuthConfig } from '../SocketProvider';
import { useDriverChannel } from '../useDriverChannel';
import { orderStore } from '../../data/orderStore';
import { clearV3 } from '../../api/storage';

type Pending = { resolve: (v: { value?: unknown; done?: boolean }) => void };
type MockChannelEntry = { name: string; subscribed: boolean; queue: Pending[]; push: (value: unknown) => void };

/*
 * A SocketCluster stand-in. Channels are per name, as in the real client:
 * subscribing again to a name returns the same data stream, so a loop that was
 * already reading it keeps receiving after a resubscribe. Lifecycle and auth
 * events are emitted by the test; nothing fires on its own.
 */
type MockSocket = {
    options: Record<string, any>;
    OPEN: string;
    state: string;
    signedAuthToken: string | null;
    authenticate: jest.Mock;
    disconnect: jest.Mock;
    subscribeCalls: string[];
    subscribe: (name: string) => unknown;
    isSubscribed: (name: string) => boolean;
    channel: (name: string) => MockChannelEntry | undefined;
    emit: (event: string, data?: unknown) => void;
    listener: (event: string) => unknown;
    closeListener: (event: string) => void;
};

const mockSubscriptions: MockChannelEntry[] = [];
const mockSockets: MockSocket[] = [];

function mockCreateSocket(options: Record<string, any>): MockSocket {
    const waiters = new Map<string, ((value: unknown) => void)[]>();
    const wait = (event: string) =>
        new Promise<unknown>((resolve) => {
            waiters.set(event, [...(waiters.get(event) ?? []), resolve]);
        });
    const channels = new Map<string, MockChannelEntry & { api: unknown }>();

    const socket: MockSocket = {
        options,
        OPEN: 'open',
        state: 'open',
        signedAuthToken: null,
        authenticate: jest.fn(async (token: string) => {
            socket.signedAuthToken = token;
        }),
        disconnect: jest.fn(),
        subscribeCalls: [],
        subscribe: (name: string) => {
            socket.subscribeCalls.push(name);
            let entry = channels.get(name);
            if (!entry) {
                const waiting: Pending[] = [];
                const buffered: unknown[] = [];
                const created = {
                    name,
                    subscribed: true,
                    queue: waiting,
                    push: (value: unknown) => {
                        const next = waiting.shift();
                        if (next) next.resolve({ value, done: false });
                        else buffered.push(value);
                    },
                    api: {
                        next: () =>
                            buffered.length
                                ? Promise.resolve({ value: buffered.shift(), done: false })
                                : new Promise((resolve) => waiting.push({ resolve })),
                        unsubscribe: () => {
                            created.subscribed = false;
                        },
                        close: () => undefined,
                    },
                };
                entry = created;
                channels.set(name, created);
                mockSubscriptions.push(created);
            }
            entry.subscribed = true;
            return entry.api;
        },
        isSubscribed: (name: string) => !!channels.get(name)?.subscribed,
        channel: (name: string) => channels.get(name),
        emit: (event: string, data?: unknown) => {
            const list = waiters.get(event) ?? [];
            waiters.set(event, []);
            list.forEach((resolve) => resolve(data));
        },
        // Both shapes the app reads: `once()` for lifecycle, async iteration for auth events.
        listener: (event: string) => ({
            once: () => wait(event),
            [Symbol.asyncIterator]: () => ({ next: () => wait(event).then((value) => ({ value, done: false })) }),
        }),
        closeListener: () => undefined,
    };
    return socket;
}

jest.mock('socketcluster-client', () => ({
    __esModule: true,
    default: {
        create: (options: Record<string, any>) => {
            const socket = mockCreateSocket(options);
            mockSockets.push(socket);
            return socket;
        },
    },
}));

const API_HOST = 'https://api.example.test';

const tokenResponse = (token: string, expiresIn = 900) => ({
    status: 200,
    ok: true,
    json: async () => ({ token, expires_in: expiresIn }),
});

/** Lets promise chains (fetch → json → authenticate) run to completion. */
async function settle() {
    for (let i = 0; i < 50; i++) await Promise.resolve();
}

const realFetch = (globalThis as any).fetch;

function Driver({ id }: { id: string }) {
    useDriverChannel(id);
    return null;
}

beforeEach(() => {
    mockSubscriptions.length = 0;
    mockSockets.length = 0;
    clearV3();
    orderStore.clear();
});

afterEach(() => {
    jest.useRealTimers();
    (globalThis as any).fetch = realFetch;
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
        expect(mockSubscriptions.map((s) => s.name)).toContain('driver.driver_me');
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
        const channel = mockSubscriptions.find((s) => s.name === 'driver.driver_me');
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
        expect(mockSubscriptions).toHaveLength(0);
        await ReactTestRenderer.act(async () => tree?.unmount());
    });

    describe('authentication', () => {
        async function mount(auth: SocketAuthConfig | undefined) {
            let tree: ReactTestRenderer.ReactTestRenderer | undefined;
            await ReactTestRenderer.act(async () => {
                tree = ReactTestRenderer.create(
                    <SocketProvider config={{ hostname: 'socket.test', port: 8000 }} auth={auth}>
                        <Driver id="driver_me" />
                    </SocketProvider>
                );
            });
            return tree!;
        }

        it('hands the driver socket token to the handshake, in memory and not in the URL', async () => {
            const fetchMock = jest.fn(async () => tokenResponse('sock-1'));
            (globalThis as any).fetch = fetchMock;
            const tree = await mount({ host: API_HOST, authToken: 'driver-bearer' });

            const { options } = mockSockets[0];
            // What socketcluster-client calls during the handshake.
            await expect(options.authEngine.loadToken('socketcluster.authToken')).resolves.toBe('sock-1');

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string> }];
            expect(url).toBe(`${API_HOST}/v1/socket/token`);
            expect(init.method).toBe('POST');
            expect(init.headers.Authorization).toBe('Bearer driver-bearer');

            expect(options.query).toEqual({ client: 'navigator/3.0.0' });
            expect(JSON.stringify(options)).not.toContain('sock-1');

            // A fresh token is reused rather than fetched again.
            await expect(options.authEngine.loadToken('socketcluster.authToken')).resolves.toBe('sock-1');
            expect(fetchMock).toHaveBeenCalledTimes(1);
            await ReactTestRenderer.act(async () => tree.unmount());
        });

        it('connects anonymously when the server has no socket token route', async () => {
            const fetchMock = jest.fn(async () => ({ status: 404, ok: false, json: async () => ({}) }));
            (globalThis as any).fetch = fetchMock;
            const tree = await mount({ host: API_HOST, authToken: 'driver-bearer' });

            const { options } = mockSockets[0];
            await expect(options.authEngine.loadToken('socketcluster.authToken')).resolves.toBeNull();
            // An old server stays anonymous for the session rather than being asked on every handshake.
            await expect(options.authEngine.loadToken('socketcluster.authToken')).resolves.toBeNull();
            expect(fetchMock).toHaveBeenCalledTimes(1);
            // Realtime still works.
            expect(mockSubscriptions.map((s) => s.name)).toContain('driver.driver_me');
            await ReactTestRenderer.act(async () => tree.unmount());
        });

        it('connects anonymously while no driver is signed in', async () => {
            const fetchMock = jest.fn(async () => tokenResponse('sock-1'));
            (globalThis as any).fetch = fetchMock;
            const tree = await mount({ host: API_HOST });

            await expect(mockSockets[0].options.authEngine.loadToken('socketcluster.authToken')).resolves.toBeNull();
            expect(fetchMock).not.toHaveBeenCalled();
            await ReactTestRenderer.act(async () => tree.unmount());
        });

        it('refreshes the token a minute before it expires', async () => {
            jest.useFakeTimers();
            const fetchMock = jest.fn().mockResolvedValueOnce(tokenResponse('sock-1', 900)).mockResolvedValueOnce(tokenResponse('sock-2', 900));
            (globalThis as any).fetch = fetchMock;
            const tree = await mount({ host: API_HOST, authToken: 'driver-bearer' });
            const socket = mockSockets[0];

            await ReactTestRenderer.act(async () => {
                await socket.options.authEngine.loadToken('socketcluster.authToken');
            });
            expect(socket.authenticate).not.toHaveBeenCalled();

            await ReactTestRenderer.act(async () => {
                jest.advanceTimersByTime((900 - 61) * 1000);
                await settle();
            });
            expect(fetchMock).toHaveBeenCalledTimes(1);

            await ReactTestRenderer.act(async () => {
                jest.advanceTimersByTime(1000);
                await settle();
            });
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(socket.authenticate).toHaveBeenCalledWith('sock-2');
            await ReactTestRenderer.act(async () => tree.unmount());
        });

        it.each(['deauthenticate', 'kickOut', 'subscribeFail'])('re-authenticates and resubscribes held channels after %s', async (event) => {
            jest.useFakeTimers();
            const fetchMock = jest.fn().mockResolvedValueOnce(tokenResponse('sock-1')).mockResolvedValueOnce(tokenResponse('sock-2'));
            (globalThis as any).fetch = fetchMock;
            orderStore.upsert({ id: 'order_1', status: 'driver_enroute' });
            const tree = await mount({ host: API_HOST, authToken: 'driver-bearer' });
            const socket = mockSockets[0];

            await ReactTestRenderer.act(async () => {
                socket.signedAuthToken = await socket.options.authEngine.loadToken('socketcluster.authToken');
            });
            expect(socket.subscribeCalls.filter((name) => name === 'driver.driver_me')).toHaveLength(1);

            // The server dropped the channel along with the authentication.
            socket.channel('driver.driver_me')!.subscribed = false;
            await ReactTestRenderer.act(async () => {
                socket.emit(event, { channel: 'driver.driver_me', message: 'expired' });
                await settle();
                jest.advanceTimersByTime(1000);
                await settle();
            });

            expect(socket.authenticate).toHaveBeenCalledWith('sock-2');
            expect(socket.subscribeCalls.filter((name) => name === 'driver.driver_me')).toHaveLength(2);
            expect(socket.isSubscribed('driver.driver_me')).toBe(true);
            // The socket was kept, not rebuilt, and the existing loop still delivers.
            expect(mockSockets).toHaveLength(1);
            await ReactTestRenderer.act(async () => {
                socket.channel('driver.driver_me')!.push({ event: 'order.driver_unassigned', data: { id: 'order_1' } });
                await settle();
            });
            expect(orderStore.removalOf('order_1')).toBe('reassigned');
            await ReactTestRenderer.act(async () => tree.unmount());
        });

        it('does not resubscribe a channel nothing listens to any more', async () => {
            jest.useFakeTimers();
            const fetchMock = jest.fn(async () => tokenResponse('sock-1'));
            (globalThis as any).fetch = fetchMock;
            let tree: ReactTestRenderer.ReactTestRenderer | undefined;
            const auth = { host: API_HOST, authToken: 'driver-bearer' };
            await ReactTestRenderer.act(async () => {
                tree = ReactTestRenderer.create(
                    <SocketProvider config={{ hostname: 'socket.test' }} auth={auth}>
                        <Driver id="driver_me" />
                    </SocketProvider>
                );
            });
            await ReactTestRenderer.act(async () => {
                tree!.update(<SocketProvider config={{ hostname: 'socket.test' }} auth={auth} />);
            });
            const socket = mockSockets[0];
            await ReactTestRenderer.act(async () => {
                socket.emit('kickOut', { channel: 'driver.driver_me' });
                await settle();
                jest.advanceTimersByTime(1000);
                await settle();
            });
            expect(socket.subscribeCalls.filter((name) => name === 'driver.driver_me')).toHaveLength(1);
            await ReactTestRenderer.act(async () => tree?.unmount());
        });

        it('rebuilds the socket for a new driver session, and anonymously on sign-out', async () => {
            (globalThis as any).fetch = jest.fn(async () => tokenResponse('sock-1'));
            let tree: ReactTestRenderer.ReactTestRenderer | undefined;
            const render = (auth: SocketAuthConfig | undefined) => (
                <SocketProvider config={{ hostname: 'socket.test' }} auth={auth}>
                    <Driver id="driver_me" />
                </SocketProvider>
            );
            await ReactTestRenderer.act(async () => {
                tree = ReactTestRenderer.create(render({ host: API_HOST, authToken: 'driver-bearer', session: 1 }));
            });
            // Same props in a new object: not a new session.
            await ReactTestRenderer.act(async () => {
                tree!.update(render({ host: API_HOST, authToken: 'driver-bearer', session: 1 }));
            });
            expect(mockSockets).toHaveLength(1);

            // Organisation switch that kept the bearer.
            await ReactTestRenderer.act(async () => {
                tree!.update(render({ host: API_HOST, authToken: 'driver-bearer', session: 2 }));
            });
            expect(mockSockets).toHaveLength(2);
            expect(mockSockets[0].disconnect).toHaveBeenCalled();

            // Sign-out.
            await ReactTestRenderer.act(async () => {
                tree!.update(render({ host: API_HOST, session: 3 }));
            });
            expect(mockSockets).toHaveLength(3);
            await expect(mockSockets[2].options.authEngine.loadToken('socketcluster.authToken')).resolves.toBeNull();
            // The new socket picked the driver channel up again.
            expect(mockSockets[2].subscribeCalls).toContain('driver.driver_me');
            await ReactTestRenderer.act(async () => tree?.unmount());
        });
    });
});
