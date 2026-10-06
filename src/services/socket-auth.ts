/**
 * Realtime socket authentication for the driver app.
 *
 * The API mints a short-lived socket token for the signed-in driver (`POST {host}/{namespace}/socket/token`,
 * authorized with the driver's bearer token). The token is handed to the SocketCluster handshake through a
 * custom in-memory auth engine, refreshed before it expires, and re-fetched when the socket server drops
 * the authentication or kicks the socket out of a channel.
 *
 * The token only ever lives in memory: never in MMKV/AsyncStorage/localStorage and never in the socket URL.
 *
 * Servers that predate socket auth answer the mint route with 404; the socket then connects anonymously,
 * exactly as before. The same happens while no driver is signed in.
 */

/** Refresh (or re-fetch on handshake) this long before the token expires. */
export const SOCKET_TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

/** After a failed mint request, wait this long before asking again. */
export const SOCKET_TOKEN_RETRY_DELAY_MS = 30 * 1000;

/** Give up re-subscribing a channel after this many consecutive subscribe failures. */
export const SOCKET_SUBSCRIBE_MAX_RETRIES = 3;

const AUTH_EVENTS = ['deauthenticate', 'kickOut', 'subscribeFail', 'subscribe'];

export interface SocketTokenResponse {
    token: string;
    expiresIn: number;
}

export interface FetchSocketTokenOptions {
    host: string;
    namespace?: string;
    authToken?: string | null;
    fetchImpl?: (url: string, init?: any) => Promise<any>;
}

export class SocketTokenError extends Error {
    status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.name = 'SocketTokenError';
        this.status = status;
    }
}

export function socketTokenUrl(host: string, namespace: string = 'v1'): string {
    const cleanHost = String(host ?? '').replace(/\/+$/, '');
    const cleanNamespace = String(namespace ?? '').replace(/^\/+|\/+$/g, '');
    return [cleanHost, cleanNamespace, 'socket/token'].filter(Boolean).join('/');
}

export function socketClientTag(version?: string | null): string {
    return `navigator/${version || 'unknown'}`;
}

/**
 * Mint a socket token for the signed-in driver.
 *
 * Resolves `null` when there is no driver token, or when the server has no socket token route (404),
 * meaning the socket should connect anonymously. Throws `SocketTokenError` for any other failure.
 */
export async function fetchSocketToken({ host, namespace = 'v1', authToken, fetchImpl }: FetchSocketTokenOptions): Promise<SocketTokenResponse | null> {
    if (!authToken || !host) {
        return null;
    }

    const doFetch = fetchImpl ?? (globalThis as any).fetch;
    let response;
    try {
        response = await doFetch(socketTokenUrl(host, namespace), {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
            },
            body: '{}',
        });
    } catch (err) {
        throw new SocketTokenError(`Unable to reach the socket token endpoint: ${(err as Error)?.message ?? err}`);
    }

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new SocketTokenError(`Socket token request failed with HTTP ${response.status}`, response.status);
    }

    const payload = await response.json();
    const token = payload?.token;
    const expiresIn = Number(payload?.expires_in);
    if (typeof token !== 'string' || !token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new SocketTokenError('Socket token response is malformed', response.status);
    }

    return { token, expiresIn };
}

/** Lifetime in seconds (exp - iat) of a JWT, or null when it cannot be read. Uses no device clock. */
export function jwtLifetimeSeconds(jwt: string): number | null {
    try {
        const segment = String(jwt).split('.')[1];
        if (!segment) return null;
        let base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        const decode = (globalThis as any).atob;
        const json = typeof decode === 'function' ? decode(base64) : (globalThis as any).Buffer?.from(base64, 'base64').toString('utf8');
        const claims = JSON.parse(json);
        const lifetime = Number(claims?.exp) - Number(claims?.iat);
        return Number.isFinite(lifetime) && lifetime > 0 ? lifetime : null;
    } catch {
        return null;
    }
}

export interface SocketAuthOptions extends FetchSocketTokenOptions {
    now?: () => number;
    setTimer?: (fn: () => void, ms: number) => any;
    clearTimer?: (handle: any) => void;
    logger?: Pick<Console, 'log' | 'warn'>;
}

/**
 * Creates the per-socket auth session. One session belongs to one socket and one driver session;
 * recreate both when the driver, organization or instance changes.
 */
export function createSocketAuth(options: SocketAuthOptions) {
    const { host, namespace = 'v1', authToken, fetchImpl } = options;
    const now = options.now ?? (() => Date.now());
    const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
    const logger = options.logger ?? console;

    let current: { token: string; expiresAt: number } | null = null;
    let inflight: Promise<string | null> | null = null;
    let unsupported = false;
    let lastFailureAt = 0;
    let refreshTimer: any = null;
    let recoveryTimer: any = null;
    let destroyed = false;
    let socket: any = null;
    const tracked = new Set<string>();
    const subscribeFailures = new Map<string, number>();

    const isValid = () => !!current && current.expiresAt > now();
    const isFresh = () => !!current && current.expiresAt - now() > SOCKET_TOKEN_REFRESH_MARGIN_MS;

    const clearRefresh = () => {
        if (refreshTimer) {
            clearTimer(refreshTimer);
            refreshTimer = null;
        }
    };

    const scheduleRefresh = (delayMs: number) => {
        clearRefresh();
        if (destroyed) return;
        refreshTimer = setTimer(() => {
            refreshTimer = null;
            refresh();
        }, Math.max(delayMs, 1000));
    };

    const remember = (token: string, expiresInSeconds: number) => {
        current = { token, expiresAt: now() + expiresInSeconds * 1000 };
        // Refresh a minute before expiry; very short tokens refresh at half-life instead.
        const delay = expiresInSeconds * 1000 > SOCKET_TOKEN_REFRESH_MARGIN_MS * 2 ? expiresInSeconds * 1000 - SOCKET_TOKEN_REFRESH_MARGIN_MS : (expiresInSeconds * 1000) / 2;
        scheduleRefresh(delay);
    };

    /**
     * Resolve a usable socket token, fetching a fresh one when there is none, when it is close to
     * expiry, or when `force` is set. Resolves null for an anonymous connection.
     */
    const getToken = (force = false): Promise<string | null> => {
        if (destroyed || !authToken || unsupported) {
            return Promise.resolve(null);
        }
        if (!force && isFresh()) {
            return Promise.resolve(current!.token);
        }
        if (lastFailureAt && now() - lastFailureAt < SOCKET_TOKEN_RETRY_DELAY_MS) {
            return Promise.resolve(isValid() ? current!.token : null);
        }
        if (inflight) {
            return inflight;
        }

        inflight = fetchSocketToken({ host, namespace, authToken, fetchImpl })
            .then((result) => {
                if (destroyed) return null;
                lastFailureAt = 0;
                if (!result) {
                    // Old server without socket auth: stay anonymous for this session.
                    unsupported = true;
                    current = null;
                    clearRefresh();
                    return null;
                }
                remember(result.token, result.expiresIn);
                return result.token;
            })
            .catch((err) => {
                lastFailureAt = now();
                logger.warn('[SocketAuth] Unable to fetch a socket token:', err?.message ?? err);
                return isValid() ? current!.token : null;
            })
            .finally(() => {
                inflight = null;
            });

        return inflight;
    };

    const isOpen = () => !!socket && socket.state === (socket.OPEN ?? 'open');

    async function refresh() {
        if (destroyed) return;
        const previous = current?.token;
        const token = await getToken(true);
        if (destroyed) return;

        if (!token || token === previous) {
            // The mint request failed; try again shortly while the current token is still valid.
            if (token && isValid() && !refreshTimer) {
                scheduleRefresh(SOCKET_TOKEN_RETRY_DELAY_MS);
            }
            return;
        }

        if (isOpen()) {
            try {
                await socket.authenticate(token);
            } catch (err) {
                logger.warn('[SocketAuth] Socket re-authentication failed:', (err as Error)?.message ?? err);
            }
        }
    }

    /** Re-authenticate with a fresh token and resubscribe every channel the app still wants. */
    async function recover() {
        if (destroyed || !socket) return;

        const token = await getToken(true);
        if (destroyed) return;

        if (token && isOpen() && socket.signedAuthToken !== token) {
            try {
                await socket.authenticate(token);
            } catch (err) {
                logger.warn('[SocketAuth] Socket re-authentication failed:', (err as Error)?.message ?? err);
            }
        }

        if (destroyed) return;
        for (const channelName of tracked) {
            if (!socket.isSubscribed(channelName, true)) {
                socket.subscribe(channelName);
            }
        }
    }

    const scheduleRecovery = (delayMs = 250) => {
        if (destroyed || recoveryTimer) return;
        recoveryTimer = setTimer(() => {
            recoveryTimer = null;
            recover().catch((err) => logger.warn('[SocketAuth] Socket recovery failed:', err?.message ?? err));
        }, delayMs);
    };

    const handleEvent = (event: string, data: any) => {
        switch (event) {
            case 'deauthenticate':
            case 'kickOut':
                scheduleRecovery();
                break;
            case 'subscribeFail': {
                const channelName = data?.channel;
                if (!channelName || !tracked.has(channelName)) break;
                const attempts = subscribeFailures.get(channelName) ?? 0;
                if (attempts >= SOCKET_SUBSCRIBE_MAX_RETRIES) {
                    logger.warn(`[SocketAuth] Giving up on channel "${channelName}" after ${attempts} failed subscriptions.`);
                    break;
                }
                subscribeFailures.set(channelName, attempts + 1);
                scheduleRecovery(1000 * 2 ** attempts);
                break;
            }
            case 'subscribe':
                if (data?.channel) subscribeFailures.delete(data.channel);
                break;
        }
    };

    const consume = (target: any, event: string) => {
        (async () => {
            try {
                for await (const data of target.listener(event)) {
                    if (destroyed) break;
                    handleEvent(event, data);
                }
            } catch (err) {
                if (!destroyed) logger.warn(`[SocketAuth] "${event}" listener stopped:`, (err as Error)?.message ?? err);
            }
        })();
    };

    // socketcluster-client auth engine: all methods return promises, token kept in memory only.
    const authEngine = {
        saveToken(_name: string, token: string) {
            if (!destroyed && token && token !== current?.token) {
                const lifetime = jwtLifetimeSeconds(token);
                if (lifetime) remember(token, lifetime);
            }
            return Promise.resolve(token);
        },
        removeToken(_name: string) {
            const previous = current?.token ?? null;
            current = null;
            clearRefresh();
            return Promise.resolve(previous);
        },
        loadToken(_name: string) {
            return getToken(false);
        },
    };

    return {
        authEngine,
        getToken,
        refresh,
        recover,
        attach(target: any) {
            socket = target;
            AUTH_EVENTS.forEach((event) => consume(target, event));
        },
        track(channelName: string) {
            if (channelName) tracked.add(channelName);
        },
        untrack(channelName: string) {
            tracked.delete(channelName);
            subscribeFailures.delete(channelName);
        },
        untrackAll() {
            tracked.clear();
            subscribeFailures.clear();
        },
        trackedChannels() {
            return Array.from(tracked);
        },
        destroy() {
            destroyed = true;
            clearRefresh();
            if (recoveryTimer) {
                clearTimer(recoveryTimer);
                recoveryTimer = null;
            }
            current = null;
            tracked.clear();
            subscribeFailures.clear();
            if (socket && typeof socket.closeListener === 'function') {
                AUTH_EVENTS.forEach((event) => socket.closeListener(event));
            }
            socket = null;
        },
    };
}

export type SocketAuth = ReturnType<typeof createSocketAuth>;
