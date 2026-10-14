/**
 * The realtime connection — v3 had none.
 *
 * Geofence crossings, order assignment, dispatch and ad-hoc offers are all
 * already broadcast by FleetOps on the driver's own channel; the app was simply
 * not listening, so every one of those arrived only when something happened to
 * refetch. That is why an offer could go stale before the driver saw it.
 *
 * Three things this is careful about, learned from v2's version:
 *
 * **A socket is not a source of truth.** Events say *something changed*; the
 * app then asks the API what it changed to. Rendering straight from a socket
 * payload means the screen and the server disagree the moment one is missed,
 * and a mobile socket misses things.
 *
 * **Connection state is not reachability.** The socket dropping does not mean
 * the API is unreachable, and v2 conflated the two — see `SyncContext`. This
 * publishes its own state and nothing else reads it as "online".
 *
 * **A handler must not be able to kill the connection.** Every callback is
 * wrapped, because one thrown error inside an async iterator ends the loop and
 * the driver silently stops receiving anything.
 *
 * **The socket is authenticated as the driver.** The handshake carries a
 * short-lived socket token minted for the signed-in driver
 * (`POST {host}/{namespace}/socket/token`), through the same in-memory auth
 * session v2 uses (`services/socket-auth`). The token is refreshed a minute
 * before it expires; when the server drops the authentication, kicks the
 * socket out of a channel or refuses a subscription, a fresh token is fetched
 * and every channel `listen` still holds is subscribed again. A server without
 * the route (404) and a signed-out app connect anonymously, as before. The
 * token lives in memory only — never in storage and never in the socket URL.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import socketClusterClient from 'socketcluster-client';
import { getVersion } from 'react-native-device-info';
import { createSocketAuth, socketClientTag, type SocketAuth } from '../../services/socket-auth';
import { parseRealtimeEvent, type RealtimeEvent } from './events';
import { bumpLiveRefresh } from './liveRefresh';

export interface SocketConfig {
    hostname?: string;
    port?: number;
    path?: string;
    secure?: boolean;
}

/**
 * Who the socket connects as. Every field is a primitive so the connection is
 * rebuilt exactly when one of them changes — and only then.
 */
export interface SocketAuthConfig {
    /** API host the socket token is minted from. */
    host?: string;
    namespace?: string;
    /** Driver bearer token. Absent, the socket connects anonymously. */
    authToken?: string;
    /**
     * Changes whenever a driver session starts or ends, or the organisation
     * changes. The API can hand back the same bearer across those, and the
     * handshake still has to be made again for the new session.
     */
    session?: string | number;
}

type Handler = (event: RealtimeEvent) => void;

interface SocketValue {
    isConnected: boolean;
    /**
     * True once a socket exists to subscribe on. `listen` changes identity
     * when it flips, so an effect that depends on `listen` subscribes again —
     * which is the whole fix for subscribers that mounted before the socket
     * did and were handed a no-op.
     */
    isReady: boolean;
    /** Subscribe to a channel; returns an unsubscribe. */
    listen: (channel: string, handler: Handler) => () => void;
}

const SocketContext = createContext<SocketValue>({
    isConnected: false,
    isReady: false,
    listen: () => () => {},
});

export function useRealtime(): SocketValue {
    return useContext(SocketContext);
}

interface ScChannel {
    isSubscribed?: () => boolean;
    next: () => Promise<{ value?: unknown; done?: boolean }>;
    unsubscribe?: () => void;
    close?: () => void;
}
interface ScSocket {
    subscribe: (channel: string) => ScChannel;
    listener: (name: string) => { once: () => Promise<unknown> };
    disconnect?: () => void;
}

/** One socket, the auth session that belongs to it, and how often each channel is held. */
interface Connection {
    socket: ScSocket;
    auth: SocketAuth;
    holds: Map<string, number>;
}

function clientVersion(): string | undefined {
    try {
        return getVersion();
    } catch {
        return undefined;
    }
}

export function SocketProvider({
    children,
    config,
    /** Disables the connection entirely — used by tests and by a host that has none. */
    enabled = true,
    auth,
}: {
    children: React.ReactNode;
    config?: SocketConfig;
    enabled?: boolean;
    /** Absent, the socket connects anonymously. */
    auth?: SocketAuthConfig;
}) {
    const [isConnected, setIsConnected] = useState(false);
    /*
     * State, not a ref. The socket is created in an effect, which runs after
     * every child's effects — so a child subscribing on mount (the driver
     * channel) found a null ref, got a no-op unsubscribe, and never tried
     * again. Holding it in state re-renders the tree once it exists, `listen`
     * is rebuilt around it, and every effect depending on `listen` re-runs.
     */
    const [connection, setConnection] = useState<Connection | null>(null);
    const socket = connection?.socket ?? null;

    const authHost = auth?.host;
    const authNamespace = auth?.namespace;
    const authToken = auth?.authToken;
    const authSession = auth?.session;

    /*
     * Rebuilt on login, logout, organisation switch (`authToken`, `session`)
     * and instance reconfiguration (the API host or the socket config), so the
     * handshake always carries a token for the current driver — or none.
     */
    useEffect(() => {
        if (!enabled || !config?.hostname) return;

        // One auth session per socket; it never outlives it.
        const socketAuth = createSocketAuth({
            host: authHost ?? '',
            namespace: authNamespace ?? 'v1',
            authToken: authToken ?? null,
        });

        const options = {
            hostname: config.hostname,
            port: config.port,
            path: config.path ?? '/socketcluster/',
            secure: config.secure,
            // In memory only: the token is never written to storage.
            authEngine: socketAuth.authEngine,
            // Identifies the client, never the driver — the token is not in the URL.
            query: { client: socketClientTag(clientVersion()) },
        };
        const created = socketClusterClient.create(options as unknown as Parameters<typeof socketClusterClient.create>[0]) as unknown as ScSocket;
        try {
            socketAuth.attach(created);
        } catch {
            // Without its listeners the socket still works; it just cannot recover its auth.
        }
        setConnection({ socket: created, auth: socketAuth, holds: new Map() });

        let alive = true;

        /*
         * SocketCluster publishes lifecycle through async iterators rather than
         * callbacks, so each state is its own loop. `once()` resolves per
         * occurrence, which is what makes a reconnect show up as a fresh
         * connect rather than being swallowed.
         */
        const watch = async (name: string, onEvent: () => void) => {
            while (alive) {
                try {
                    await created.listener(name).once();
                } catch {
                    return;
                }
                if (alive) onEvent();
            }
        };
        /*
         * Whatever was broadcast while the socket was down is gone for good, so
         * a *re*connect asks every live query to look again rather than trust
         * that nothing happened in the gap.
         */
        let connectedBefore = false;
        void watch('connect', () => {
            setIsConnected(true);
            if (connectedBefore) bumpLiveRefresh();
            connectedBefore = true;
        });
        void watch('disconnect', () => setIsConnected(false));

        return () => {
            alive = false;
            setIsConnected(false);
            setConnection(null);
            socketAuth.destroy();
            created.disconnect?.();
        };
    }, [enabled, config?.hostname, config?.port, config?.path, config?.secure, authHost, authNamespace, authToken, authSession]);

    /*
     * SocketCluster re-subscribes its channels by itself after a reconnect, so
     * a subscription only has to be made again when the socket *object*
     * changes — which is exactly what depending on `connection` does. A
     * kick-out or a refused subscription is not a reconnect; the auth session
     * subscribes those channels again itself, and data keeps reaching the loop
     * below because SocketCluster routes it by channel name.
     */
    const listen = useCallback((channelName: string, handler: Handler) => {
        if (!connection || !channelName) return () => {};
        const { socket: current, auth: socketAuth, holds } = connection;

        /*
         * The auth session resubscribes what it tracks after a kick-out or a
         * refused subscription. Counted, so one of two listeners on a channel
         * letting go neither closes it under the other nor stops it being
         * recovered.
         */
        holds.set(channelName, (holds.get(channelName) ?? 0) + 1);
        socketAuth.track(channelName);

        let stopped = false;
        const channel = current.subscribe(channelName);

        void (async () => {
            while (!stopped) {
                let value: unknown;
                try {
                    const next = await channel.next();
                    // Released while waiting; the channel may live on for another listener.
                    if (stopped || next.done) break;
                    value = next.value;
                } catch {
                    // The channel ended or errored; stop rather than spin.
                    break;
                }

                const event = parseRealtimeEvent(value);
                if (!event) continue;
                try {
                    handler(event);
                } catch {
                    /*
                     * A throwing handler must not end the loop. Losing one
                     * event is a bug; losing every subsequent event because of
                     * it is an outage the driver cannot see.
                     */
                }
            }
        })();

        return () => {
            stopped = true;
            const remaining = (holds.get(channelName) ?? 1) - 1;
            if (remaining > 0) {
                holds.set(channelName, remaining);
                return;
            }
            holds.delete(channelName);
            socketAuth.untrack(channelName);
            channel.unsubscribe?.();
            channel.close?.();
        };
    }, [connection]);

    const value = useMemo<SocketValue>(() => ({ isConnected, isReady: !!socket, listen }), [isConnected, socket, listen]);

    return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export default SocketProvider;
