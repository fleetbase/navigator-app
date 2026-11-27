/**
 * The proof already captured on an order — signatures, photos and scans.
 *
 *   GET /v1/orders/{id}/proofs   every proof on the order, its items' included
 *                                (fleetops routes.php, OrderController@proofs)
 *
 * Each says its `type` (signature | photo | scan), what it was captured against
 * (`subject_type`, `subject_id`), the stored image's `url` when it has one, and
 * for a scan the code that was read (`raw`). The order resource itself does not
 * embed them, so they are fetched here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFleetbase } from '../api';

export interface OrderProof {
    id: string;
    type?: 'signature' | 'photo' | 'scan' | null;
    subject_type?: string | null;
    subject_id?: string | null;
    url?: string | null;
    remarks?: string | null;
    raw?: unknown;
    created_at?: string | null;
}

function rowsOf(raw: unknown): OrderProof[] {
    const body = Array.isArray(raw) ? raw : (raw as { data?: unknown })?.data;
    return Array.isArray(body) ? (body as OrderProof[]).filter((row) => row && typeof row.id === 'string') : [];
}

export function useOrderProofs(orderId?: string, reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [proofs, setProofs] = useState<OrderProof[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const inFlight = useRef(false);
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    const load = useCallback(async () => {
        if (!orderId || inFlight.current) return;
        inFlight.current = true;
        setIsLoading(true);
        try {
            const rows = rowsOf(await adapter.get(`orders/${orderId}/proofs`));
            // Oldest first: the order they were captured in.
            rows.sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
            if (alive.current) setProofs(rows);
        } catch {
            // Left as it was: what is already shown stays, and the next reload tries again.
        } finally {
            inFlight.current = false;
            if (alive.current) setIsLoading(false);
        }
    }, [adapter, orderId]);

    useEffect(() => {
        void load();
    }, [load, reloadToken]);

    return { proofs, isLoading, reload: load };
}
