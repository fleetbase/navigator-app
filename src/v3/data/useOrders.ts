/**
 * React bindings for the order store.
 *
 * Every hook here goes through `useSyncExternalStore` against a selector that
 * returns a cached, identity-stable array. That is the whole point: a list can
 * re-render its parent without its `data` prop changing identity, so
 * `React.memo` on the row components actually holds.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { OrderStore, orderStore, dayKey, type OrderRecord } from './orderStore';

function useStoreSelector<T>(store: OrderStore, select: (s: OrderStore) => T): T {
    const getSnapshot = useCallback(() => select(store), [store, select]);
    return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function useAllOrders(store: OrderStore = orderStore): OrderRecord[] {
    return useStoreSelector(store, useCallback((s: OrderStore) => s.all(), []));
}

export function useActiveOrders(store: OrderStore = orderStore): OrderRecord[] {
    return useStoreSelector(store, useCallback((s: OrderStore) => s.active(), []));
}

export function useOffers(store: OrderStore = orderStore): OrderRecord[] {
    return useStoreSelector(store, useCallback((s: OrderStore) => s.offers(), []));
}

/**
 * `day` defaults to today at **day** precision. Passing a Date is fine — it is
 * reduced to a day key, so a re-render with a new Date object does not produce
 * a new subscription the way v2's second-precision key did.
 */
export function useOrdersOnDay(day: string | Date = new Date(), store: OrderStore = orderStore): OrderRecord[] {
    const key = typeof day === 'string' ? day : dayKey(day);
    return useStoreSelector(store, useCallback((s: OrderStore) => s.onDay(key), [key]));
}

export function useOrder(id: string | undefined, store: OrderStore = orderStore): OrderRecord | undefined {
    return useStoreSelector(store, useCallback((s: OrderStore) => (id ? s.get(id) : undefined), [id]));
}

/** Count for the Orders tab badge. */
export function useActiveOrderCount(store: OrderStore = orderStore): number {
    return useActiveOrders(store).length;
}

export { dayKey };
