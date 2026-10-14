/**
 * Connectivity and the outbound mutation queue.
 *
 * Phase 1 ships the surface the shell needs; Phase 2 supplies the real queue
 * (src/v3/api/queue.ts) and reachability.
 *
 * `isOnline` currently proxies off the SocketCluster connection, which is the
 * only connectivity signal the app has — @react-native-community/netinfo is not
 * a dependency. That proxy is imperfect: the socket can drop while HTTP still
 * works. Phase 2 replaces it with the queue's own reachability probe.
 */
import React, { createContext, useContext, useMemo } from 'react';

export type SyncState = 'idle' | 'syncing' | 'failed';

export interface SyncContextValue {
    isOnline: boolean;
    /** Mutations waiting to reach the server. */
    queuedCount: number;
    syncState: SyncState;
    /** How many synced in the last successful flush — drives the success banner. */
    lastSyncedCount: number;
    retry: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export interface SyncProviderProps {
    children: React.ReactNode;
    isOnline?: boolean;
    queuedCount?: number;
    syncState?: SyncState;
    lastSyncedCount?: number;
    onRetry?: () => void;
}

export function SyncProvider({
    children,
    isOnline = true,
    queuedCount = 0,
    syncState = 'idle',
    lastSyncedCount = 0,
    onRetry,
}: SyncProviderProps) {
    const value = useMemo<SyncContextValue>(
        () => ({ isOnline, queuedCount, syncState, lastSyncedCount, retry: onRetry ?? (() => {}) }),
        [isOnline, queuedCount, syncState, lastSyncedCount, onRetry]
    );

    return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
    const ctx = useContext(SyncContext);
    if (!ctx) throw new Error('useSync must be used within a SyncProvider');
    return ctx;
}
