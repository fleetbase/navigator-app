/**
 * Fetches an order's activity flow.
 *
 * Configs change rarely and are shared across many orders, so they are cached
 * by id for the session — otherwise every order-detail open refetches the same
 * document. `order-configs` is public and read-only.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFleetbase } from '../api';
import type { FlowActivity } from '../ui/ActivityStepper';

export interface OrderConfig {
    id: string;
    key?: string;
    name?: string;
    flow: FlowActivity[];
}

const cache = new Map<string, OrderConfig>();
const inFlight = new Map<string, Promise<OrderConfig | null>>();

/** Exposed so tests can start from a known state. */
export function clearOrderConfigCache(): void {
    cache.clear();
    inFlight.clear();
}

export function useOrderConfig(configId?: string | null) {
    const { adapter } = useFleetbase();
    const [config, setConfig] = useState<OrderConfig | null>(configId ? (cache.get(configId) ?? null) : null);
    const [isLoading, setIsLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        if (!configId) return;
        const cached = cache.get(configId);
        if (cached) {
            setConfig(cached);
            return;
        }

        setIsLoading(true);
        setFailed(false);
        try {
            let promise = inFlight.get(configId);
            if (!promise) {
                promise = adapter
                    .get(`order-configs/${configId}`)
                    .then((raw) => {
                        const data = (raw as { data?: unknown })?.data ?? raw;
                        const next = data as OrderConfig;
                        if (next && Array.isArray(next.flow)) {
                            cache.set(configId, next);
                            return next;
                        }
                        return null;
                    })
                    .finally(() => inFlight.delete(configId));
                inFlight.set(configId, promise);
            }
            setConfig(await promise);
        } catch {
            // A missing config is not fatal: the screen degrades to hiding the
            // stepper rather than inventing a flow.
            setFailed(true);
            setConfig(null);
        } finally {
            setIsLoading(false);
        }
    }, [adapter, configId]);

    useEffect(() => {
        void load();
    }, [load]);

    return { config, flow: config?.flow ?? [], isLoading, failed, reload: load };
}

export default useOrderConfig;
