/**
 * Fetches an order's activity flow.
 *
 * Configs change rarely and are shared across many orders, so they are cached
 * by id for the session — otherwise every order-detail open refetches the same
 * document. `order-configs` is public and read-only. The cache itself lives in
 * `orderConfigCache` so non-React code (the order store's "active" view, the
 * finished-status check) can read the same configs.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFleetbase } from '../api';
import { cachedOrderConfig, loadOrderConfig, type OrderConfig } from './orderConfigCache';

export type { OrderConfig };
export { clearOrderConfigCache } from './orderConfigCache';

export function useOrderConfig(configId?: string | null) {
    const { adapter } = useFleetbase();
    const [config, setConfig] = useState<OrderConfig | null>(cachedOrderConfig(configId) ?? null);
    const [isLoading, setIsLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        if (!configId) return;
        const cached = cachedOrderConfig(configId);
        if (cached) {
            setConfig(cached);
            return;
        }

        setIsLoading(true);
        setFailed(false);
        try {
            setConfig(await loadOrderConfig(adapter, configId));
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
