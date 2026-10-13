/**
 * The session cache of order configs, outside React.
 *
 * `useOrderConfig` fills it; the order store and the status helpers read it.
 * Configs are what say which activity *finishes* an order (`complete: true`),
 * and a booking flow ends in its own codes — so anything that classifies an
 * order as done or in hand needs the config, not a hard-coded list of status
 * names. Reading it synchronously keeps those classifiers pure; a config that
 * arrives later announces itself so derived views can be recomputed.
 */
import type { FlowActivity } from './activityFlow';

export interface OrderConfig {
    id: string;
    key?: string;
    name?: string;
    flow: FlowActivity[];
}

const cache = new Map<string, OrderConfig>();
const inFlight = new Map<string, Promise<OrderConfig | null>>();
const listeners = new Set<() => void>();

export function cachedOrderConfig(id?: string | null): OrderConfig | undefined {
    return id ? cache.get(id) : undefined;
}

export function cacheOrderConfig(id: string, config: OrderConfig): void {
    cache.set(id, config);
    for (const fn of listeners) fn();
}

/** Called whenever a config is added, so derived views can be recomputed. */
export function onOrderConfigCached(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

type Getter = { get: (path: string, query?: Record<string, unknown>) => Promise<unknown> };

/**
 * Loads one config, sharing an in-flight request between callers. Resolves to
 * `null` for a payload with no flow; rejects on a transport or HTTP failure.
 */
export function loadOrderConfig(adapter: Getter, id: string): Promise<OrderConfig | null> {
    const cached = cache.get(id);
    if (cached) return Promise.resolve(cached);
    let promise = inFlight.get(id);
    if (!promise) {
        promise = adapter
            .get(`order-configs/${id}`)
            .then((raw) => {
                const data = (raw as { data?: unknown })?.data ?? raw;
                const next = data as OrderConfig;
                if (next && Array.isArray(next.flow)) {
                    cacheOrderConfig(id, next);
                    return next;
                }
                return null;
            })
            .finally(() => inFlight.delete(id));
        inFlight.set(id, promise);
    }
    return promise;
}

/** Exposed so tests can start from a known state. */
export function clearOrderConfigCache(): void {
    cache.clear();
    inFlight.clear();
}
