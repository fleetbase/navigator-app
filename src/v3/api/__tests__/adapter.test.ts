import { NavigatorAdapter, ApiError, isQueuedAck, REQUEST_TIMEOUT_MS } from '../NavigatorAdapter';
import { MutationQueue, setIdFactory } from '../queue';
import { clearV3 } from '../storage';

const HOST = 'https://api.example.test';
let fetchMock: jest.Mock;
let n = 0;

const ok = (json: unknown = { ok: true }) =>
    ({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(json) }) as unknown as Response;
const httpError = (status: number, json: unknown = {}) =>
    ({ ok: false, status, statusText: 'Error', json: () => Promise.resolve(json) }) as unknown as Response;

beforeEach(() => {
    clearV3();
    n = 0;
    setIdFactory(() => `id_${++n}`);
    fetchMock = jest.fn();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
});

const make = (over: Partial<ConstructorParameters<typeof NavigatorAdapter>[0]> = {}) =>
    new NavigatorAdapter({ host: HOST, queue: new MutationQueue(), ...over });

const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
const headerOf = (name: string) => {
    const init = lastCall()[1] as { headers: Headers };
    return init.headers.get(name);
};

describe('NavigatorAdapter credentials', () => {
    it('uses the platform token before a session exists', async () => {
        fetchMock.mockResolvedValue(ok());
        await make({ platformToken: 'flb_platform_abc' }).get('onboard/organizations');
        expect(headerOf('Authorization')).toBe('Bearer flb_platform_abc');
    });

    it('prefers the driver token once a session exists', async () => {
        fetchMock.mockResolvedValue(ok());
        await make({ platformToken: 'flb_platform_abc', userToken: 'driver_xyz' }).get('orders');
        expect(headerOf('Authorization')).toBe('Bearer driver_xyz');
    });

    it('switches credential when the session changes — org switch issues a new token', async () => {
        fetchMock.mockResolvedValue(ok());
        const a = make({ platformToken: 'plat' });
        await a.get('orders');
        expect(headerOf('Authorization')).toBe('Bearer plat');
        a.setUserToken('driver_1');
        await a.get('orders');
        expect(headerOf('Authorization')).toBe('Bearer driver_1');
        a.setUserToken(undefined);
        await a.get('orders');
        expect(headerOf('Authorization')).toBe('Bearer plat');
    });
});

describe('NavigatorAdapter idempotency', () => {
    it('stamps a key on mutations', async () => {
        fetchMock.mockResolvedValue(ok());
        await make().post('orders/1/complete', {});
        expect(headerOf('Idempotency-Key')).toBeTruthy();
    });

    it('does not stamp one on reads — a GET is not an operation to dedupe', async () => {
        fetchMock.mockResolvedValue(ok());
        await make().get('orders');
        expect(headerOf('Idempotency-Key')).toBeNull();
    });

    it('uses a distinct key per distinct mutation', async () => {
        fetchMock.mockResolvedValue(ok());
        const a = make();
        await a.post('orders/1/complete', {});
        const first = headerOf('Idempotency-Key');
        await a.post('orders/2/complete', {});
        expect(headerOf('Idempotency-Key')).not.toBe(first);
    });
});

describe('NavigatorAdapter failure handling', () => {
    it('queues a mutation that fails for transport reasons and acknowledges it', async () => {
        fetchMock.mockRejectedValue(new TypeError('Network request failed'));
        const queue = new MutationQueue();
        const result = await make({ queue }).post('orders/1/complete', { note: 'done' });

        expect(isQueuedAck(result)).toBe(true);
        const snap = queue.snapshot();
        expect(snap.pendingCount).toBe(1);
        expect(snap.items[0].path).toBe('orders/1/complete');
        expect(snap.items[0].body).toEqual({ note: 'done' });
    });

    it('does NOT queue a read — a stale GET replayed on reconnect is wrong', async () => {
        fetchMock.mockRejectedValue(new TypeError('Network request failed'));
        const queue = new MutationQueue();
        await expect(make({ queue }).get('orders')).rejects.toBeInstanceOf(ApiError);
        expect(queue.snapshot().pendingCount).toBe(0);
    });

    it('does NOT queue an HTTP error — the server saw it and rejected it', async () => {
        fetchMock.mockResolvedValue(httpError(422, { errors: ['Odometer is required'] }));
        const queue = new MutationQueue();
        await expect(make({ queue }).post('fuel-reports', {})).rejects.toMatchObject({ status: 422, message: 'Odometer is required' });
        expect(queue.snapshot().pendingCount).toBe(0);
    });

    it('distinguishes transport failure from HTTP failure', async () => {
        fetchMock.mockRejectedValue(new TypeError('Network request failed'));
        await make().get('orders').catch((e: ApiError) => {
            expect(e.isTransport).toBe(true);
            expect(e.status).toBeUndefined();
        });

        fetchMock.mockResolvedValue(httpError(500, {}));
        await make().get('orders').catch((e: ApiError) => {
            expect(e.isTransport).toBe(false);
            expect(e.status).toBe(500);
        });
    });

    it('signals 401 to the host rather than silently failing', async () => {
        fetchMock.mockResolvedValue(httpError(401, { error: 'Unauthenticated' }));
        const onUnauthorized = jest.fn();
        await expect(make({ onUnauthorized }).get('orders')).rejects.toMatchObject({ status: 401 });
        expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });
});

describe('NavigatorAdapter queue replay', () => {
    it('replays queued work with the original idempotency key', async () => {
        fetchMock.mockRejectedValue(new TypeError('offline'));
        const queue = new MutationQueue();
        const adapter = make({ queue });
        await adapter.post('orders/1/complete', { a: 1 });

        const key = queue.snapshot().items[0].idempotencyKey;

        fetchMock.mockResolvedValue(ok());
        await queue.flush();

        expect(headerOf('Idempotency-Key')).toBe(key);
        expect(queue.snapshot().items).toHaveLength(0);
    });

    it('replays in order after a reconnect', async () => {
        fetchMock.mockRejectedValue(new TypeError('offline'));
        const queue = new MutationQueue();
        const adapter = make({ queue });
        await adapter.post('a', {});
        await adapter.post('b', {});
        await adapter.post('c', {});

        fetchMock.mockResolvedValue(ok());
        await queue.flush();

        const paths = fetchMock.mock.calls.slice(-3).map((c) => String(c[0]).replace(`${HOST}/v1/`, ''));
        expect(paths).toEqual(['a', 'b', 'c']);
    });
});

/**
 * The queue is for work the driver meant to do — a stop completion replayed on
 * reconnect is right. Replaying an *organisation switch* is not: it would move
 * the driver between organisations later, unasked, possibly mid-job.
 */
describe('mutations that must never queue', () => {
    const offline = () => Promise.reject(new TypeError('Network request failed'));

    it('queues an ordinary mutation that fails on transport', async () => {
        const queue = new MutationQueue();
        const adapter = make({ queue });
        fetchMock.mockImplementation(offline);

        const result = await adapter.post('fuel-reports', { volume: '10' });
        expect(isQueuedAck(result)).toBe(true);
        expect(queue.snapshot().pendingCount).toBe(1);
    });

    it('refuses to queue an organisation switch, and throws instead', async () => {
        const queue = new MutationQueue();
        const adapter = make({ queue });
        fetchMock.mockImplementation(offline);

        await expect(adapter.post('drivers/driver_1/switch-organization', { next: 'company_2' })).rejects.toBeTruthy();
        expect(queue.snapshot().pendingCount).toBe(0);
    });

    it('refuses to queue sign-in, which would replay a stale credential', async () => {
        const queue = new MutationQueue();
        const adapter = make({ queue });
        fetchMock.mockImplementation(offline);

        await expect(adapter.post('drivers/login', { identity: 'x', password: 'y' })).rejects.toBeTruthy();
        expect(queue.snapshot().pendingCount).toBe(0);
    });
});

/**
 * Connectivity is judged from what happened to our own requests, not from the
 * radio. A handset can show full signal while the API is unreachable — captive
 * portal, dropped VPN, DNS, or the server being down — and the driver only
 * cares whether their work can reach dispatch.
 *
 * This mattered because nothing was supplying `isConnected` at all: it defaulted
 * to true, so the app believed it was online always and every offline
 * affordance was unreachable.
 */
describe('what must never be queued', () => {
    /*
     * Queueing is the right default for a driver's work, but a few things are
     * claims on a shared resource or on a session, and replaying them later is
     * worse than losing them.
     */
    it.each([
        ['accepting an ad-hoc offer', 'orders/order_1/start'],
        ['changing a password', 'drivers/driver_1/change-password'],
        ['switching organisation', 'drivers/driver_1/switch-organization'],
    ])('refuses to queue %s', async (_name, path) => {
        const queue = new MutationQueue();
        const adapter = make({ queue });
        fetchMock.mockRejectedValue(new TypeError('Network request failed'));

        await expect(adapter.post(path, {})).rejects.toBeInstanceOf(ApiError);
        expect(queue.snapshot().items).toHaveLength(0);
    });

    it('still queues ordinary work offline', async () => {
        const adapter = make();
        fetchMock.mockRejectedValue(new TypeError('Network request failed'));
        const result = await adapter.post('issues', { report: 'x' });
        expect(isQueuedAck(result)).toBe(true);
    });
});

describe('reachability', () => {
    it('starts optimistic, so a cold start does not flash the offline banner', () => {
        expect(make().isReachable()).toBe(true);
    });

    it('goes unreachable on a transport failure', async () => {
        const adapter = make();
        fetchMock.mockRejectedValue(new TypeError('Network request failed'));
        await adapter.get('orders').catch(() => {});
        expect(adapter.isReachable()).toBe(false);
    });

    it('gives up on a server that accepts the connection and never answers', async () => {
        /*
         * Found against a real instance: the container was up, the TCP connect
         * succeeded, and no byte ever came back. fetch has no default timeout,
         * so the app sat on a skeleton indefinitely and never learned it was
         * offline. The failure must be transient so the mutation queues.
         */
        jest.useFakeTimers();
        const adapter = make();
        fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) =>
            new Promise((_resolve, reject) => {
                init.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
            })
        );

        const pending = adapter.get('orders').catch((e: ApiError) => e);
        expect(adapter.isReachable()).toBe(true); // still waiting, still hopeful
        jest.advanceTimersByTime(REQUEST_TIMEOUT_MS);
        const err = (await pending) as ApiError;

        expect(err.isTransport).toBe(true);
        expect(err.message).toBe('The server did not respond');
        expect(adapter.isReachable()).toBe(false);
        jest.useRealTimers();
    });

    it('recovers on any answer at all, including an error status', async () => {
        // A 500 still proves the round trip works; this is about transport.
        const adapter = make();
        fetchMock.mockRejectedValue(new TypeError('Network request failed'));
        await adapter.get('orders').catch(() => {});
        expect(adapter.isReachable()).toBe(false);

        fetchMock.mockResolvedValue({
            ok: false, status: 500, statusText: 'Server Error', json: async () => ({}),
        } as never);
        await adapter.get('orders').catch(() => {});
        expect(adapter.isReachable()).toBe(true);
    });

    it('notifies subscribers only when it actually changes', async () => {
        const adapter = make();
        const seen: boolean[] = [];
        adapter.onReachabilityChange((r) => seen.push(r));

        fetchMock.mockRejectedValue(new TypeError('Network request failed'));
        await adapter.get('a').catch(() => {});
        await adapter.get('b').catch(() => {});

        fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) } as never);
        await adapter.get('c');
        await adapter.get('d');

        // Two failures then two successes is one transition each way.
        expect(seen).toEqual([false, true]);
    });

    it('stops notifying once unsubscribed', async () => {
        const adapter = make();
        const seen: boolean[] = [];
        const off = adapter.onReachabilityChange((r) => seen.push(r));
        off();

        fetchMock.mockRejectedValue(new TypeError('Network request failed'));
        await adapter.get('a').catch(() => {});
        expect(seen).toEqual([]);
    });
});
