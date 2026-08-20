/**
 * The v3 HTTP adapter.
 *
 * `new Fleetbase(key, { adapter })` accepts an adapter instance, so every
 * request can be intercepted **without forking @fleetbase/sdk**. The SDK funnels
 * get/post/put/patch/delete through a single `request()`, which is the seam used
 * here.
 *
 * What it adds over the stock BrowserAdapter:
 *
 * 1. **Dual credentials.** v2 passed the driver's Sanctum token into the SDK's
 *    `publicKey` slot, so the SDK had no concept of "app credential" vs "user
 *    credential". Here the platform token authorises pre-auth calls (organisation
 *    discovery, login) and the driver token takes over once a session exists.
 * 2. **Idempotency keys on every mutation**, generated once and reused across
 *    retries — this is what makes an offline replay safe.
 * 3. **Offline enqueue.** A mutation that fails for transport reasons is queued
 *    and acknowledged optimistically, so a driver in a basement can finish a stop.
 * 4. **Typed failures.** The stock adapter collapses network errors and HTTP
 *    errors into `new Error(message)`, which makes "should I retry this?"
 *    unanswerable. `ApiError` carries the status.
 */
import { BrowserAdapter } from '@fleetbase/sdk';
import { mutationQueue, type MutationQueue, type QueuedMutation } from './queue';

export class ApiError extends Error {
    readonly status?: number;
    readonly isTransport: boolean;
    constructor(message: string, status?: number, isTransport = false) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.isTransport = isTransport;
    }
}

/** Resolved value for a mutation that was queued rather than sent. */
export interface QueuedAck {
    __queued: true;
    id: string;
    idempotencyKey: string;
}

export function isQueuedAck(value: unknown): value is QueuedAck {
    return !!value && typeof value === 'object' && (value as QueuedAck).__queued === true;
}

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface NavigatorAdapterConfig {
    host: string;
    namespace?: string;
    /** System-level credential for pre-auth surface. */
    platformToken?: string;
    /** Driver Sanctum token, once a session exists. */
    userToken?: string;
    queue?: MutationQueue;
    /** Called on a 401 so the host can re-auth or sign out. */
    onUnauthorized?: () => void;
    /** Human label for a queued mutation, for the sync-queue screen. */
    describe?: (method: string, path: string) => string;
}

export class NavigatorAdapter extends BrowserAdapter {
    private platformToken?: string;
    private userToken?: string;
    private queue: MutationQueue;
    private onUnauthorized?: () => void;
    private describe: (method: string, path: string) => string;

    constructor(config: NavigatorAdapterConfig) {
        // The base class stamps `Authorization: Bearer <publicKey>`; the token
        // actually used is decided per-request in authHeader().
        super({ ...config, publicKey: config.userToken ?? config.platformToken ?? '', namespace: config.namespace ?? 'v1' });

        this.platformToken = config.platformToken;
        this.userToken = config.userToken;
        this.queue = config.queue ?? mutationQueue;
        this.onUnauthorized = config.onUnauthorized;
        this.describe = config.describe ?? ((m, p) => `${m} ${p}`);

        this.queue.setSender((item) => this.sendQueued(item));
    }

    /** Called on login, org switch and sign-out. */
    setUserToken(token?: string) {
        this.userToken = token;
    }

    setPlatformToken(token?: string) {
        this.platformToken = token;
    }

    private authHeader(): Record<string, string> {
        const token = this.userToken ?? this.platformToken;
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    private url(path: string) {
        return `${this.host}/${this.namespace}/${path}`;
    }

    /**
     * Single interception point. Deliberately does not call `super.request` —
     * the base implementation swallows the distinction between a transport
     * failure and an HTTP error, which is exactly what the retry policy needs.
     */
    request(path: string, method = 'GET', data: { body?: string } = {}, options: { url?: string; headers?: Record<string, string>; mode?: RequestInit['mode'] } = {}): Promise<unknown> {
        const upper = method.toUpperCase();
        const isMutation = MUTATIONS.has(upper);
        const idempotencyKey = isMutation ? this.newKey() : undefined;

        return this.dispatch({
            url: options.url ?? this.url(path),
            method: upper,
            body: data.body,
            headers: { ...this.headers, ...this.authHeader(), ...(options.headers ?? {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
            mode: options.mode,
        }).then(
            (json) => json,
            (err: ApiError) => {
                if (err.status === 401) {
                    this.onUnauthorized?.();
                    throw err;
                }

                // Only transport failures queue. An HTTP error means the server
                // saw the request and rejected it; replaying will not help.
                if (isMutation && err.isTransport) {
                    const item = this.queue.enqueue({
                        method: upper as QueuedMutation['method'],
                        path,
                        body: data.body ? safeParse(data.body) : undefined,
                        label: this.describe(upper, path),
                        idempotencyKey,
                    });
                    const ack: QueuedAck = { __queued: true, id: item.id, idempotencyKey: item.idempotencyKey };
                    return ack;
                }

                throw err;
            }
        );
    }

    /** Replay path for the queue — same transport, no re-queue on failure. */
    private async sendQueued(item: QueuedMutation): Promise<{ ok: true } | { ok: false; status?: number; message: string }> {
        try {
            await this.dispatch({
                url: this.url(item.path),
                method: item.method,
                body: item.body === undefined ? undefined : JSON.stringify(item.body),
                headers: { ...this.headers, ...this.authHeader(), 'Idempotency-Key': item.idempotencyKey },
            });
            return { ok: true };
        } catch (err) {
            const e = err as ApiError;
            return { ok: false, status: e.status, message: e.message };
        }
    }

    private async dispatch(req: { url: string; method: string; body?: string; headers: Record<string, string>; mode?: RequestInit['mode'] }): Promise<unknown> {
        let response: Response;
        try {
            response = await fetch(req.url, {
                method: req.method,
                mode: req.mode ?? 'cors',
                headers: new Headers({ 'Content-Type': 'application/json', ...req.headers }),
                ...(req.body === undefined ? {} : { body: req.body }),
            });
        } catch (err) {
            // fetch only rejects on transport failure — DNS, no route, TLS,
            // aborted. This is the branch that means "queue it".
            throw new ApiError((err as Error)?.message ?? 'Network request failed', undefined, true);
        }

        const json = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message = extractError(json) ?? response.statusText ?? `Request failed with ${response.status}`;
            throw new ApiError(message, response.status, false);
        }

        return json;
    }

    private counter = 0;
    private newKey(): string {
        this.counter += 1;
        return `nav_${Date.now().toString(36)}_${this.counter.toString(36)}`;
    }
}

function safeParse(body: string): unknown {
    try {
        return JSON.parse(body);
    } catch {
        return body;
    }
}

function extractError(json: unknown): string | undefined {
    if (!json || typeof json !== 'object') return undefined;
    const j = json as { errors?: unknown; error?: unknown; message?: unknown };
    if (Array.isArray(j.errors) && j.errors.length) return String(j.errors[0]);
    if (typeof j.error === 'string') return j.error;
    if (typeof j.message === 'string') return j.message;
    return undefined;
}

export default NavigatorAdapter;
