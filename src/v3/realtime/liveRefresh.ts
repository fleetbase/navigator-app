/**
 * "Something on the server changed — go and ask what."
 *
 * The socket deliberately does not carry state into the app (see
 * `SocketProvider`), so an event needs some way to tell whatever is on screen
 * to refetch. This is that signal: a counter every live query observes.
 *
 * A counter rather than a per-order invalidation because a driver holds a
 * handful of orders, not thousands, and refetching the list is cheaper than
 * maintaining a dependency graph that can go subtly wrong. If that stops being
 * true it should become per-key, not per-order-id — the id is not always in the
 * event.
 */
import { useSyncExternalStore } from 'react';

let revision = 0;
const listeners = new Set<() => void>();

/** Tell every live query that the server has moved on. */
export function bumpLiveRefresh(): void {
    revision += 1;
    for (const listener of listeners) listener();
}

export function liveRefreshRevision(): number {
    return revision;
}

/** Resets between tests; not used by the app. */
export function resetLiveRefresh(): void {
    revision = 0;
    listeners.clear();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * The current revision. Include it in a query's dependencies and the query
 * re-runs whenever the socket says something moved.
 */
export function useLiveRefresh(): number {
    return useSyncExternalStore(subscribe, liveRefreshRevision, liveRefreshRevision);
}
