/**
 * "This order changed" — held until the driver has seen it.
 *
 * `order.changed` (and its push twin, `order_changed`) says what moved and
 * carries a one-line `summary` written for a person. The order itself is
 * refetched like any other event; this keeps the *notice*, because the driver
 * may be on another screen when it arrives and the point is that they find out
 * when they next look at the order — not that a toast flashed past while they
 * were driving.
 *
 * Keyed by order, newest wins: two edits in a row are one "this changed" with
 * the latest summary, and the change list accumulates so a drop-off change is
 * not forgotten because a note was edited after it.
 */
import { useCallback, useSyncExternalStore } from 'react';

export interface OrderChange {
    orderId: string;
    summary?: string;
    changes: string[];
    changedBy?: string;
    at: number;
}

let changes: Record<string, OrderChange> = {};
const listeners = new Set<() => void>();

function emit() {
    for (const fn of listeners) fn();
}

export function recordOrderChange(change: { orderId?: string; summary?: string; changes?: string[] | null; changedBy?: string }): void {
    const { orderId } = change;
    if (!orderId) return;
    const prev = changes[orderId];
    const merged = Array.from(new Set([...(prev?.changes ?? []), ...(change.changes ?? [])]));
    changes = {
        ...changes,
        [orderId]: {
            orderId,
            summary: change.summary ?? prev?.summary,
            changes: merged,
            changedBy: change.changedBy ?? prev?.changedBy,
            at: Date.now(),
        },
    };
    emit();
}

export function dismissOrderChange(orderId: string): void {
    if (!(orderId in changes)) return;
    const next = { ...changes };
    delete next[orderId];
    changes = next;
    emit();
}

export function orderChangeOf(orderId?: string): OrderChange | undefined {
    return orderId ? changes[orderId] : undefined;
}

/** Resets between tests; not used by the app. */
export function resetOrderChanges(): void {
    changes = {};
    listeners.clear();
}

function subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function useOrderChange(orderId?: string): OrderChange | undefined {
    const get = useCallback(() => orderChangeOf(orderId), [orderId]);
    return useSyncExternalStore(subscribe, get, get);
}
