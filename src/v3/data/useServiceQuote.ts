/**
 * The service quote behind an order's purchase rate — the lines of the rate
 * breakdown on the order's Details tab.
 *
 * The order carries `purchase_rate` with the total, the currency, the service
 * name and the *id* of its service quote (PurchaseRate.php). The lines
 * themselves — base fee, distance, surcharges — are the quote's `items`, read
 * from `GET /v1/service-quotes/{id}` (ServiceQuote.php, ServiceQuoteItem.php).
 * Each line has an amount, a currency, a free-text `details` and a `code`;
 * there is no structured "11.2 km × 0.85" on a line, so none is drawn.
 */
import { useEffect, useState } from 'react';
import { useFleetbase } from '../api';

export interface ServiceQuoteItem {
    id?: string;
    amount?: number | string | null;
    currency?: string | null;
    details?: string | null;
    code?: string | null;
}

export interface ServiceQuoteRecord {
    id: string;
    service_name?: string | null;
    amount?: number | string | null;
    currency?: string | null;
    items?: ServiceQuoteItem[] | null;
}

export interface PurchaseRateRecord {
    id?: string;
    /** The quote's public id on the driver API; an object only for the console. */
    service_quote?: string | { id?: string } | null;
    service_name?: string | null;
    amount?: number | string | null;
    currency?: string | null;
    status?: string | null;
}

/** The order's purchase rate, when it has one worth showing. */
export function purchaseRateOf(order?: { purchase_rate?: unknown } | null): PurchaseRateRecord | undefined {
    const rate = order?.purchase_rate;
    if (!rate || typeof rate !== 'object') return undefined;
    const r = rate as PurchaseRateRecord;
    // `new PurchaseRate(null)` serialises as an object of nulls, not as null.
    return r.id || r.amount != null ? r : undefined;
}

export function serviceQuoteIdOf(rate?: PurchaseRateRecord | null): string | undefined {
    const quote = rate?.service_quote;
    if (typeof quote === 'string') return quote || undefined;
    if (quote && typeof quote === 'object' && typeof quote.id === 'string') return quote.id;
    return undefined;
}

// Quotes do not change once purchased, so one read per session is enough.
const cache = new Map<string, ServiceQuoteRecord>();

export function useServiceQuote(quoteId?: string) {
    const { adapter } = useFleetbase();
    const [quote, setQuote] = useState<ServiceQuoteRecord | undefined>(quoteId ? cache.get(quoteId) : undefined);

    useEffect(() => {
        if (!quoteId) {
            setQuote(undefined);
            return;
        }
        const cached = cache.get(quoteId);
        if (cached) {
            setQuote(cached);
            return;
        }
        let alive = true;
        adapter
            .get(`service-quotes/${quoteId}`)
            .then((raw: unknown) => {
                const row = ((raw as { data?: unknown })?.data ?? raw) as ServiceQuoteRecord;
                if (!row?.id) return;
                cache.set(quoteId, row);
                if (alive) setQuote(row);
            })
            // The total on the purchase rate still shows; only the lines are missing.
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [adapter, quoteId]);

    return { quote, items: quote?.items ?? [] };
}
