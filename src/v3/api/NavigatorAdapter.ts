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
import { describeMutation } from './describeMutation';

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

/**
 * Mutations that must **never** be queued, however they fail.
 *
 * The queue exists so work done in a basement survives to reach the server. That
 * is right for a stop completion or a fuel report — replaying them later is
 * exactly what the driver meant. It is wrong for anything that changes *who the
 * session is*: an organisation switch replayed twenty minutes later would move
 * the driver between organisations without them asking, quite possibly while
 * they are mid-job somewhere else.
 *
 * These fail loudly instead, so the screen can say it did not work.
 */
const NEVER_QUEUE = [
    /switch-organization/,
    /\/login\b/,
    /\/logout\b/,
    /verify-code/,
    /switch-vehicle/,
    /change-password/,
    /reset-password/,
    /*
     * Starting an order claims it. For an ad-hoc offer that is a race against
     * every other nearby driver, and replaying it from a queue an hour later
     * would claim a job that has long since gone to someone else — or reopen
     * one the customer cancelled. An accept that could not be sent is an accept
     * that did not happen.
     */
    /orders\/[^/]+\/start\b/,
    /*
     * Optimise re-sequences a route from a position. Replayed from a queue it
     * would reorder the driver's stops from wherever they were an hour ago,
     * and the preview they confirmed would no longer be what is applied.
     */
    /manifests\/[^/]+\/optimize\b/,
    /*
     * An upload's whole point is the file id it answers with, which the
     * message or record it belongs to needs before it can be sent. Replayed
     * later it lands as an orphan nothing references.
     */
    /files\/base64\b/,
];

function isQueueable(path: string): boolean {
    return !NEVER_QUEUE.some((pattern) => pattern.test(path));
}

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

/**
 * How long we wait for the API before calling it unreachable. Long enough to
 * survive a slow first byte on a poor connection, short enough that a driver
 * standing at a door is not staring at a spinner.
 */
export const REQUEST_TIMEOUT_MS = 20_000;

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
        // Default to a driver-facing description rather than "POST issues",
        // which is what the sync-queue screen would otherwise show.
        this.describe = config.describe ?? ((m, p) => describeMutation(m, p).fallback);

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
     * A URL on this host outside the `v1` namespace. The ledger extension
     * mounts its consumable API at `/ledger/v1/...`, so a wallet read cannot
     * be expressed as a `v1` path; callers build the URL here and pass it as
     * `options.url` so the same auth, timeout and reachability apply.
     */
    absoluteUrl(namespace: string, path: string, query: Record<string, string | number | undefined> = {}): string {
        const qs = Object.entries(query)
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&');
        return `${this.host}/${namespace}/${path}${qs ? `?${qs}` : ''}`;
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
                if (isMutation && err.isTransport && isQueueable(path)) {
                    const item = this.queue.enqueue({
                        method: upper as QueuedMutation['method'],
                        path,
                        body: data.body ? safeParse(data.body) : undefined,
                        label: this.describe(upper, path),
                        labelKey: describeMutation(upper, path).labelKey,
                        idempotencyKey,
                        // Stamped so this cannot be sent under the next
                        // driver's token if the handset changes hands.
                        ownerId: this.ownerId,
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
        const abort = new AbortController();
        /*
         * A server that accepts the connection and then says nothing is not a
         * hypothetical: it is what a container under load, a stalled PHP-FPM
         * pool or a half-open cellular NAT all look like. fetch has no default
         * timeout, so without this the request never settles — the caller's
         * skeleton spins forever, nothing throws, and reachability stays true,
         * so the driver is not even told they are offline. A dead wait is worse
         * than a failure, because a failure can be queued and retried.
         */
        const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
        try {
            response = await fetch(req.url, {
                method: req.method,
                mode: req.mode ?? 'cors',
                signal: abort.signal,
                headers: new Headers({ 'Content-Type': 'application/json', ...req.headers }),
                ...(req.body === undefined ? {} : { body: req.body }),
            });
        } catch (err) {
            // fetch only rejects on transport failure — DNS, no route, TLS,
            // aborted. This is the branch that means "queue it", and the only
            // honest evidence that the API cannot currently be reached.
            this.setReachable(false);
            const timedOut = abort.signal.aborted;
            throw new ApiError(timedOut ? 'The server did not respond' : ((err as Error)?.message ?? 'Network request failed'), undefined, true);
        } finally {
            clearTimeout(timer);
        }

        // The server answered. Even a 500 proves the round trip works, so
        // reachability is about the transport, not the status.
        this.setReachable(true);

        const json = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message = extractError(json) ?? response.statusText ?? `Request failed with ${response.status}`;
            throw new ApiError(message, response.status, false);
        }

        return json;
    }

    /**
     * Whether the **API** is reachable, judged from what actually happened to
     * our requests rather than from the radio.
     *
     * This is deliberately not netinfo. What a driver needs to know is whether
     * their work can reach dispatch, and a device can be firmly "connected"
     * while the API is unreachable — a captive portal, a VPN that has dropped,
     * DNS, or the server simply being down. Transport failures measure the
     * thing that matters; a full signal bar does not.
     *
     * Starts optimistic: assuming offline before any request has been made
     * would show the offline banner on every cold start.
     */
    /** The signed-in driver, stamped onto anything this adapter queues. */
    ownerId?: string;

    private reachable = true;
    private reachabilityListeners = new Set<(reachable: boolean) => void>();

    isReachable(): boolean {
        return this.reachable;
    }

    onReachabilityChange(fn: (reachable: boolean) => void): () => void {
        this.reachabilityListeners.add(fn);
        return () => {
            this.reachabilityListeners.delete(fn);
        };
    }

    private setReachable(next: boolean): void {
        if (this.reachable === next) return;
        this.reachable = next;
        for (const fn of this.reachabilityListeners) fn(next);
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
