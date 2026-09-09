/**
 * Driver wallet — the ledger extension's consumable API (handover §8a).
 *
 *   GET /ledger/v1/wallet/balance       { balance, formatted_balance, currency, status }
 *   GET /ledger/v1/wallet/transactions  filter: type, direction, status, date_from, date_to; limit, page
 *
 * The routes sit under the `ledger` prefix, not `v1`, so they are reached by
 * absolute URL through the same adapter (auth, timeout, reachability intact).
 *
 * Balances are **integers in minor units** and every balance change is a
 * Transaction — so earnings is a balance plus a filtered feed, formatted once
 * at the edge with `formatMoney`. Nothing credits a driver on order completion
 * yet; that is the ledger PR still to be designed, which is why the screen is
 * config-gated and the hook is only ever asked when the gate is open.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFleetbase } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';
import { useLiveRefresh } from '../realtime/liveRefresh';
import { dayKey } from './orderStore';

export interface WalletBalance {
    balance: number;
    formatted_balance?: string;
    currency: string;
    status?: string;
}

export interface WalletTransaction {
    id: string;
    type?: string | null;
    direction?: 'credit' | 'debit' | string | null;
    status?: string | null;
    settlement_status?: string | null;
    amount?: number | string | null;
    net_amount?: number | string | null;
    fee_amount?: number | string | null;
    balance_after?: number | string | null;
    currency?: string | null;
    description?: string | null;
    payer_name?: string | null;
    payee_name?: string | null;
    gateway_transaction_id?: string | null;
    created_at?: string;
    [key: string]: unknown;
}

export type WalletPeriod = 'week' | 'month' | 'all';

export type WalletLoadState = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

function unwrap(raw: unknown): unknown {
    return (raw as { data?: unknown })?.data ?? raw;
}

/** `date_from` for a period, as a day key; `undefined` means no lower bound. */
export function periodStart(period: WalletPeriod, now: Date = new Date()): string | undefined {
    if (period === 'all') return undefined;
    const d = new Date(now);
    if (period === 'week') {
        // Monday-start week, the convention on a driver's roster.
        const day = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() - day);
    } else {
        d.setDate(1);
    }
    return dayKey(d);
}

/** Signed minor-unit amount: credits add, debits take. */
export function signedAmount(tx: WalletTransaction): number {
    const raw = Number(tx.net_amount ?? tx.amount);
    if (!Number.isFinite(raw)) return 0;
    return tx.direction === 'debit' ? -Math.abs(raw) : Math.abs(raw);
}

export function useWallet(enabled: boolean, period: WalletPeriod = 'month', reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [balance, setBalance] = useState<WalletBalance | null>(null);
    const [transactions, setTransactions] = useState<WalletTransaction[] | null>(null);
    const [state, setState] = useState<WalletLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);
    const loaded = useRef(false);

    const load = useCallback(
        async (mode: 'loading' | 'refreshing' = 'loading') => {
            if (!enabled || inFlight.current) return;
            inFlight.current = true;
            setState(mode);
            setError(null);
            try {
                const [rawBalance, rawTransactions] = await Promise.all([
                    adapter.get('wallet/balance', {}, { url: adapter.absoluteUrl('ledger/v1', 'wallet/balance') }),
                    adapter.get('wallet/transactions', {}, {
                        url: adapter.absoluteUrl('ledger/v1', 'wallet/transactions', { limit: 50, date_from: periodStart(period) }),
                    }),
                ]);
                const b = unwrap(rawBalance) as WalletBalance;
                setBalance(b && typeof b === 'object' ? { ...b, balance: Number(b.balance) || 0, currency: b.currency ?? 'USD' } : null);
                const rows = unwrap(rawTransactions);
                setTransactions(Array.isArray(rows) ? (rows as WalletTransaction[]) : []);
                loaded.current = true;
                setState('ready');
            } catch (err) {
                setError(err as ApiError);
                setState('error');
            } finally {
                inFlight.current = false;
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [adapter, enabled, period, reloadToken]
    );

    const revision = useLiveRefresh();
    useEffect(() => {
        void load(loaded.current ? 'refreshing' : 'loading');
    }, [load, revision]);

    const periodTotal = useMemo(() => (transactions ?? []).reduce((sum, tx) => sum + signedAmount(tx), 0), [transactions]);

    return {
        balance,
        transactions: transactions ?? [],
        periodTotal,
        state,
        error,
        isLoading: state === 'loading' && !balance,
        isRefreshing: state === 'refreshing',
        failed: state === 'error',
        refresh: useCallback(() => load('refreshing'), [load]),
        retry: useCallback(() => load('loading'), [load]),
    };
}
