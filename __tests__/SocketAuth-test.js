import { createSocketAuth, fetchSocketToken, jwtLifetimeSeconds, socketClientTag, socketTokenUrl, SocketTokenError } from '../src/services/socket-auth';

const HOST = 'https://fleetbase.example.test';

const jsonResponse = (status, body) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
});

const tokenResponse = (token, expiresIn = 900) => jsonResponse(200, { token, expires_in: expiresIn, expires_at: '2030-01-01T00:00:00Z' });

const flush = async () => {
    for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
};

// Deterministic clock and timers injected into the auth session.
const createClock = () => {
    let time = 1_000_000;
    let nextId = 1;
    const timers = new Map();
    return {
        now: () => time,
        setTimer: (fn, ms) => {
            const id = nextId++;
            timers.set(id, { fn, at: time + ms });
            return id;
        },
        clearTimer: (id) => timers.delete(id),
        pending: () => Array.from(timers.values()),
        // Move the clock without firing timers.
        skip: (ms) => {
            time += ms;
        },
        advance: async (ms) => {
            time += ms;
            for (const [id, timer] of Array.from(timers.entries())) {
                if (timer.at <= time) {
                    timers.delete(id);
                    timer.fn();
                }
            }
            await flush();
        },
    };
};

// Minimal socketcluster-client stand-in: async-iterable listeners that can be emitted into.
const createFakeSocket = () => {
    const streams = {};
    const subscribed = new Set();
    const stream = (event) => {
        if (!streams[event]) {
            const queue = [];
            const waiters = [];
            streams[event] = {
                push(value) {
                    const waiter = waiters.shift();
                    if (waiter) waiter({ value, done: false });
                    else queue.push(value);
                },
                close() {
                    waiters.splice(0).forEach((waiter) => waiter({ value: undefined, done: true }));
                },
                iterable: {
                    [Symbol.asyncIterator]() {
                        return {
                            next: () => (queue.length ? Promise.resolve({ value: queue.shift(), done: false }) : new Promise((resolve) => waiters.push(resolve))),
                        };
                    },
                },
            };
        }
        return streams[event];
    };

    return {
        OPEN: 'open',
        state: 'open',
        signedAuthToken: null,
        listener: (event) => stream(event).iterable,
        closeListener: jest.fn((event) => stream(event).close()),
        emit: async (event, data) => {
            stream(event).push(data);
            await flush();
        },
        authenticate: jest.fn(async function (token) {
            this.signedAuthToken = token;
        }),
        isSubscribed: (name) => subscribed.has(name),
        subscribe: jest.fn((name) => subscribed.add(name)),
        drop: (name) => subscribed.delete(name),
    };
};

const makeJwt = (claims) => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.signature`;
};

describe('fetchSocketToken', () => {
    test('posts to {host}/{namespace}/socket/token with the driver bearer token', async () => {
        const fetchImpl = jest.fn(async () => tokenResponse('jwt-1', 900));

        const result = await fetchSocketToken({ host: `${HOST}/`, namespace: 'v1', authToken: 'driver-token', fetchImpl });

        expect(result).toEqual({ token: 'jwt-1', expiresIn: 900 });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe(`${HOST}/v1/socket/token`);
        expect(init.method).toBe('POST');
        expect(init.headers.Authorization).toBe('Bearer driver-token');
    });

    test('resolves null without a driver token and never calls the API', async () => {
        const fetchImpl = jest.fn();
        await expect(fetchSocketToken({ host: HOST, authToken: null, fetchImpl })).resolves.toBeNull();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('resolves null when the server has no socket token route (404)', async () => {
        const fetchImpl = jest.fn(async () => jsonResponse(404, { error: 'Not found' }));
        await expect(fetchSocketToken({ host: HOST, authToken: 'driver-token', fetchImpl })).resolves.toBeNull();
    });

    test('throws on other failures and malformed responses', async () => {
        await expect(fetchSocketToken({ host: HOST, authToken: 't', fetchImpl: async () => jsonResponse(500, {}) })).rejects.toBeInstanceOf(SocketTokenError);
        await expect(fetchSocketToken({ host: HOST, authToken: 't', fetchImpl: async () => jsonResponse(200, { token: 'x' }) })).rejects.toBeInstanceOf(SocketTokenError);
        await expect(
            fetchSocketToken({
                host: HOST,
                authToken: 't',
                fetchImpl: async () => {
                    throw new Error('offline');
                },
            })
        ).rejects.toBeInstanceOf(SocketTokenError);
    });
});

describe('helpers', () => {
    test('socketTokenUrl joins host, namespace and route', () => {
        expect(socketTokenUrl('https://api.example.test/', '/v1/')).toBe('https://api.example.test/v1/socket/token');
    });

    test('socketClientTag names the app and version', () => {
        expect(socketClientTag('2.0.11')).toBe('navigator/2.0.11');
        expect(socketClientTag(undefined)).toBe('navigator/unknown');
    });

    test('jwtLifetimeSeconds reads exp - iat', () => {
        expect(jwtLifetimeSeconds(makeJwt({ iat: 100, exp: 1000 }))).toBe(900);
        expect(jwtLifetimeSeconds('not-a-jwt')).toBeNull();
    });
});

describe('createSocketAuth', () => {
    const logger = { log: jest.fn(), warn: jest.fn() };

    const setup = (fetchImpl, authToken = 'driver-token') => {
        const clock = createClock();
        const auth = createSocketAuth({ host: HOST, namespace: 'v1', authToken, fetchImpl, logger, ...clock });
        return { clock, auth };
    };

    test('loadToken fetches once and reuses the token while it is fresh', async () => {
        const fetchImpl = jest.fn(async () => tokenResponse('jwt-1', 900));
        const { auth } = setup(fetchImpl);

        await expect(auth.authEngine.loadToken('socketcluster.authToken')).resolves.toBe('jwt-1');
        await expect(auth.authEngine.loadToken('socketcluster.authToken')).resolves.toBe('jwt-1');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test('loadToken fetches a new token within 60 seconds of expiry', async () => {
        const fetchImpl = jest.fn().mockResolvedValueOnce(tokenResponse('jwt-1', 900)).mockResolvedValueOnce(tokenResponse('jwt-2', 900));
        const { auth, clock } = setup(fetchImpl);

        await auth.authEngine.loadToken();
        clock.skip(839 * 1000); // 61 s left: still fresh
        await expect(auth.authEngine.loadToken()).resolves.toBe('jwt-1');
        expect(fetchImpl).toHaveBeenCalledTimes(1);

        clock.skip(2 * 1000); // 59 s left: a reconnect handshake must not reuse it
        await expect(auth.authEngine.loadToken()).resolves.toBe('jwt-2');
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('is anonymous without a driver token or on an old server', async () => {
        const noDriver = setup(jest.fn(), null);
        await expect(noDriver.auth.authEngine.loadToken()).resolves.toBeNull();

        const fetchImpl = jest.fn(async () => jsonResponse(404, {}));
        const { auth } = setup(fetchImpl);
        await expect(auth.authEngine.loadToken()).resolves.toBeNull();
        await expect(auth.authEngine.loadToken()).resolves.toBeNull();
        // The 404 is remembered for the session instead of being retried on every reconnect.
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test('refreshes at expires_in - 60s and re-authenticates the open socket', async () => {
        const fetchImpl = jest.fn().mockResolvedValueOnce(tokenResponse('jwt-1', 900)).mockResolvedValueOnce(tokenResponse('jwt-2', 900));
        const { auth, clock } = setup(fetchImpl);
        const socket = createFakeSocket();
        auth.attach(socket);

        await auth.authEngine.loadToken();
        await clock.advance(839 * 1000);
        expect(socket.authenticate).not.toHaveBeenCalled();

        await clock.advance(1000);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(socket.authenticate).toHaveBeenCalledWith('jwt-2');
    });

    test('re-authenticates and resubscribes tracked channels after deauthenticate / kickOut', async () => {
        const fetchImpl = jest.fn().mockResolvedValueOnce(tokenResponse('jwt-1', 900)).mockResolvedValueOnce(tokenResponse('jwt-2', 900));
        const { auth, clock } = setup(fetchImpl);
        const socket = createFakeSocket();
        auth.attach(socket);
        await auth.authEngine.loadToken();
        socket.signedAuthToken = 'jwt-1';

        auth.track('order.order_1');
        auth.track('driver.driver_1');
        socket.subscribe('driver.driver_1');
        socket.subscribe.mockClear();

        await socket.emit('deauthenticate', {});
        await socket.emit('kickOut', { channel: 'order.order_1' });
        await clock.advance(250);

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(socket.authenticate).toHaveBeenCalledTimes(1);
        expect(socket.authenticate).toHaveBeenCalledWith('jwt-2');
        expect(socket.subscribe).toHaveBeenCalledTimes(1);
        expect(socket.subscribe).toHaveBeenCalledWith('order.order_1');
    });

    test('retries a failed subscription with backoff and gives up after three attempts', async () => {
        let issued = 0;
        const fetchImpl = jest.fn(async () => tokenResponse(`jwt-${++issued}`, 900));
        const { auth, clock } = setup(fetchImpl);
        const socket = createFakeSocket();
        auth.attach(socket);
        auth.track('order.order_1');

        for (let attempt = 0; attempt < 3; attempt++) {
            socket.drop('order.order_1');
            await socket.emit('subscribeFail', { channel: 'order.order_1', error: { name: 'AuthError' } });
            await clock.advance(1000 * 2 ** attempt);
        }
        expect(socket.subscribe).toHaveBeenCalledTimes(3);

        socket.drop('order.order_1');
        await socket.emit('subscribeFail', { channel: 'order.order_1' });
        await clock.advance(60 * 1000);
        expect(socket.subscribe).toHaveBeenCalledTimes(3);

        // Untracked channels are never retried.
        await socket.emit('subscribeFail', { channel: 'vehicle.other' });
        await clock.advance(60 * 1000);
        expect(socket.subscribe).not.toHaveBeenCalledWith('vehicle.other');
    });

    test('destroy drops the token, cancels timers and closes listeners', async () => {
        const fetchImpl = jest.fn(async () => tokenResponse('jwt-1', 900));
        const { auth, clock } = setup(fetchImpl);
        const socket = createFakeSocket();
        auth.attach(socket);
        await auth.authEngine.loadToken();
        expect(clock.pending()).toHaveLength(1);

        auth.destroy();

        expect(clock.pending()).toHaveLength(0);
        expect(socket.closeListener).toHaveBeenCalledWith('deauthenticate');
        await expect(auth.authEngine.loadToken()).resolves.toBeNull();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test('saveToken keeps a server-issued token in memory', async () => {
        const fetchImpl = jest.fn();
        const { auth } = setup(fetchImpl);
        const jwt = makeJwt({ iat: 100, exp: 1000 });

        await auth.authEngine.saveToken('socketcluster.authToken', jwt, {});
        await expect(auth.authEngine.loadToken()).resolves.toBe(jwt);
        await expect(auth.authEngine.removeToken()).resolves.toBe(jwt);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
