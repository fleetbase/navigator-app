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
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import socketClusterClient from 'socketcluster-client';
import { parseRealtimeEvent, type RealtimeEvent } from './events';

export interface SocketConfig {
    hostname?: string;
    port?: number;
    path?: string;
    secure?: boolean;
}

type Handler = (event: RealtimeEvent) => void;

interface SocketValue {
    isConnected: boolean;
    /** Subscribe to a channel; returns an unsubscribe. */
    listen: (channel: string, handler: Handler) => () => void;
}

const SocketContext = createContext<SocketValue>({
    isConnected: false,
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

export function SocketProvider({
    children,
    config,
    /** Disables the connection entirely — used by tests and by a host that has none. */
    enabled = true,
}: {
    children: React.ReactNode;
    config?: SocketConfig;
    enabled?: boolean;
}) {
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<ScSocket | null>(null);

    useEffect(() => {
        if (!enabled || !config?.hostname) return;

        const socket = socketClusterClient.create({
            hostname: config.hostname,
            port: config.port,
            path: config.path ?? '/socketcluster/',
            secure: config.secure,
        }) as unknown as ScSocket;
        socketRef.current = socket;

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
                    await socket.listener(name).once();
                } catch {
                    return;
                }
                if (alive) onEvent();
            }
        };
        void watch('connect', () => setIsConnected(true));
        void watch('disconnect', () => setIsConnected(false));

        return () => {
            alive = false;
            setIsConnected(false);
            socketRef.current = null;
            socket.disconnect?.();
        };
    }, [enabled, config?.hostname, config?.port, config?.path, config?.secure]);

    const listen = useCallback((channelName: string, handler: Handler) => {
        const socket = socketRef.current;
        if (!socket || !channelName) return () => {};

        let stopped = false;
        const channel = socket.subscribe(channelName);

        void (async () => {
            while (!stopped) {
                let value: unknown;
                try {
                    const next = await channel.next();
                    if (next.done) break;
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
            channel.unsubscribe?.();
            channel.close?.();
        };
    }, []);

    const value = useMemo<SocketValue>(() => ({ isConnected, listen }), [isConnected, listen]);

    return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export default SocketProvider;
