/**
 * One Fleetbase instance for the whole app.
 *
 * v2 exposed `useFleetbase` as a plain hook, so AuthContext, ChatContext,
 * OrderManagerContext, LocationContext, DriverLayout and a dozen screens each
 * built their own `Fleetbase` **and** their own adapter — and
 * `useState(new Fleetbase(...))` (use-fleetbase.ts:13) constructed and threw one
 * away on every render.
 *
 * Worse, the instance was rebuilt whenever the token changed, which gave every
 * consumer a new `adapter` identity; ChatContext's `useEffect(..., [adapter])`
 * then refetched every channel on each login or organisation switch.
 *
 * Here the adapter is created **once** and credentials are pushed into it. The
 * identity is stable, so a token change re-authorises the next request without
 * invalidating anything.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import Fleetbase from '@fleetbase/sdk';
import { NavigatorAdapter } from './NavigatorAdapter';
import { mutationQueue, type MutationQueue, type QueueSnapshot } from './queue';

export interface FleetbaseContextValue {
    fleetbase: Fleetbase;
    adapter: NavigatorAdapter;
    queue: MutationQueue;
}

const FleetbaseContext = createContext<FleetbaseContextValue | null>(null);

export interface FleetbaseProviderProps {
    children: React.ReactNode;
    host: string;
    namespace?: string;
    platformToken?: string;
    /** Driver Sanctum token. Changing this does NOT rebuild the adapter. */
    userToken?: string;
    onUnauthorized?: () => void;
    queue?: MutationQueue;
    /** Flush the queue when connectivity returns. */
    isConnected?: boolean;
}

export function FleetbaseProvider({
    children,
    host,
    namespace = 'v1',
    platformToken,
    userToken,
    onUnauthorized,
    queue = mutationQueue,
    isConnected = true,
}: FleetbaseProviderProps) {
    // Kept in a ref so the callback the adapter holds always sees the current
    // handler without the adapter itself having to be rebuilt.
    const unauthorizedRef = useRef(onUnauthorized);
    unauthorizedRef.current = onUnauthorized;

    // Built once per host/namespace. Credentials are pushed in below.
    const value = useMemo<FleetbaseContextValue>(() => {
        const adapter = new NavigatorAdapter({
            host,
            namespace,
            platformToken,
            userToken,
            queue,
            onUnauthorized: () => unauthorizedRef.current?.(),
            describe: describeMutation,
        });

        // The SDK requires a non-empty publicKey; the adapter decides the real
        // credential per request, so this value is never used for auth.
        const fleetbase = new Fleetbase(userToken ?? platformToken ?? 'unconfigured', { host, namespace, adapter });

        return { fleetbase, adapter, queue };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [host, namespace, queue]);

    // Credentials flow in without invalidating the instance.
    useEffect(() => {
        value.adapter.setUserToken(userToken);
    }, [value, userToken]);

    useEffect(() => {
        value.adapter.setPlatformToken(platformToken);
    }, [value, platformToken]);

    // Drain whatever accumulated while offline.
    useEffect(() => {
        if (isConnected) void queue.flush();
    }, [isConnected, queue]);

    return <FleetbaseContext.Provider value={value}>{children}</FleetbaseContext.Provider>;
}

export function useFleetbase(): FleetbaseContextValue {
    const ctx = useContext(FleetbaseContext);
    if (!ctx) throw new Error('useFleetbase must be used within a FleetbaseProvider');
    return ctx;
}

/**
 * Live queue state, for the offline banner and the sync-queue screen.
 * useSyncExternalStore keeps this correct across concurrent rendering.
 */
export function useQueue(queue: MutationQueue = mutationQueue): QueueSnapshot {
    const subscribe = useMemo(() => (fn: () => void) => queue.subscribe(() => fn()), [queue]);
    const cached = useRef<QueueSnapshot>(queue.snapshot());

    return useSyncExternalStore(subscribe, () => {
        const next = queue.snapshot();
        // Snapshot must be referentially stable when nothing changed, or
        // useSyncExternalStore re-renders forever.
        // Compare the revision, not the counts: a retry changes `attempts` and
        // `lastError` in place while every count stays the same, and comparing
        // counts would pin the screen to a stale snapshot.
        const prev = cached.current;
        if (prev.revision === next.revision) return prev;
        cached.current = next;
        return next;
    });
}

/** Driver-facing labels for the sync-queue screen. */
function describeMutation(method: string, path: string): string {
    if (/orders\/.+\/complete/.test(path)) return 'Complete stop';
    if (/orders\/.+\/update-activity/.test(path)) return 'Update order activity';
    if (/orders\/.+\/capture-(signature|photo|qr|scan)/.test(path)) return 'Upload proof';
    if (/orders\/.+\/start/.test(path)) return 'Start order';
    if (/^issues/.test(path)) return method === 'POST' ? 'Report an issue' : 'Update issue';
    if (/^fuel-reports/.test(path)) return method === 'POST' ? 'Log fuel' : 'Update fuel report';
    if (/drivers\/.+\/track/.test(path)) return 'Location update';
    return `${method} ${path}`;
}

export default FleetbaseProvider;
