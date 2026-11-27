/**
 * Which of an order's items have been scanned.
 *
 * A scan of one item is a proof whose subject is that item:
 *
 *   POST orders/{id}/capture-qr/{entityId}   { code }   the text the camera read
 *   GET  orders/{id}/proofs                  every proof on the order, each
 *                                            naming its subject (`subject_id`)
 *
 * So the state comes from two places, and both are real:
 *
 *   - the **server's proofs** for the order: a scan made on any phone, with
 *     the time the server recorded it;
 *   - **this phone's own record** of the scans it made (persisted): what is
 *     shown the moment a scan is accepted, and all there is while a scan made
 *     without signal is still waiting in the queue.
 *
 * What neither can say is *where* the item was scanned: a proof carries its
 * order and its subject, not a place. So the app shows when, never "at
 * pickup".
 *
 * The server tells the subject's kind from the id's prefix (`entity_…`); an
 * id of any other shape is taken to mean the whole order. An item is therefore
 * only scannable on its own once its `entity_…` id is known.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFleetbase } from '../api';
import { readJSON, writeJSON } from '../api/storage';
import { useProofCapture, type ProofOutcome, type ScanFailure } from './useProofCapture';

export interface ItemScan {
    /** When it was scanned (ISO): the server's time for a proof, this phone's for its own record. */
    at: string;
    /** Made without signal: still on this phone, waiting to be sent. */
    queued: boolean;
    source: 'server' | 'device';
}

interface LocalScan {
    at: number;
    queued: boolean;
    proofId?: string;
}

interface ProofRow {
    id?: string;
    subject_id?: string | null;
    url?: string | null;
    remarks?: string | null;
    created_at?: string | null;
}

const STORAGE_KEY = 'data.itemScans';
/** An order is long done by then; the server's proofs are the record after that. */
const KEEP_MS = 14 * 24 * 60 * 60 * 1000;

function prune(all: Record<string, LocalScan>): Record<string, LocalScan> {
    const cutoff = Date.now() - KEEP_MS;
    const kept: Record<string, LocalScan> = {};
    for (const [key, value] of Object.entries(all)) {
        if (value && typeof value.at === 'number' && value.at >= cutoff) kept[key] = value;
    }
    return kept;
}

let ledger: Record<string, LocalScan> = prune(readJSON<Record<string, LocalScan>>(STORAGE_KEY, {}));
const listeners = new Set<() => void>();

const keyOf = (orderId: string, subjectId: string) => `${orderId}::${subjectId}`;

/** This phone scanned the item: kept so the state survives the app being closed. */
export function recordItemScan(orderId: string | undefined, subjectId: string | undefined, scan: { queued?: boolean; proofId?: string } = {}): void {
    if (!orderId || !subjectId) return;
    ledger = { ...ledger, [keyOf(orderId, subjectId)]: { at: Date.now(), queued: !!scan.queued, proofId: scan.proofId } };
    writeJSON(STORAGE_KEY, ledger);
    listeners.forEach((listener) => listener());
}

/*
 * Why the last scan of an item was refused. The scanner asks for it after a
 * failed scan so it can say why; the hosts between the two only pass the
 * outcome along.
 */
const failures: Record<string, { failure: ScanFailure; message?: string }> = {};

/** Why the item's last scan failed, if it did. */
export function itemScanFailureOf(subjectId?: string): { failure: ScanFailure; message?: string } | undefined {
    return subjectId ? failures[subjectId] : undefined;
}

/** Resets between tests; not used by the app. */
export function resetItemScans(): void {
    ledger = {};
    writeJSON(STORAGE_KEY, ledger);
    listeners.forEach((listener) => listener());
}

/**
 * The id an item is scanned under: its `entity_…` public id. Undefined when
 * the record does not carry one (a sparse copy from the order payload), in
 * which case the item cannot be scanned on its own yet.
 */
export function entityScanIdOf(entity?: Record<string, unknown> | null): string | undefined {
    if (!entity) return undefined;
    for (const value of [entity.id, entity.public_id]) {
        if (typeof value === 'string' && value.startsWith('entity_')) return value;
    }
    return undefined;
}

/** A proof made by a scan, rather than a photo or a signature (which carry a file). */
function isScanProof(proof: ProofRow): boolean {
    if (typeof proof.remarks === 'string' && /qr|scan/i.test(proof.remarks)) return true;
    return !proof.url;
}

export function useItemScans(orderId?: string) {
    const { adapter } = useFleetbase();
    const [proofs, setProofs] = useState<ProofRow[] | null>(null);
    const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [localVersion, setLocalVersion] = useState(0);
    const inFlight = useRef(false);
    const alive = useRef(true);
    const { sendScan } = useProofCapture(orderId);
    const [isSending, setIsSending] = useState(false);
    const [sendFailure, setSendFailure] = useState<string | null>(null);

    useEffect(() => {
        alive.current = true;
        const listener = () => setLocalVersion((version) => version + 1);
        listeners.add(listener);
        return () => {
            alive.current = false;
            listeners.delete(listener);
        };
    }, []);

    const load = useCallback(async () => {
        if (!orderId || inFlight.current) return;
        inFlight.current = true;
        if (alive.current) setState((previous) => (previous === 'ready' ? previous : 'loading'));
        try {
            const raw = await adapter.get(`orders/${orderId}/proofs`);
            const rows = ((raw as { data?: unknown })?.data ?? raw) as unknown;
            if (alive.current) {
                setProofs(Array.isArray(rows) ? (rows as ProofRow[]) : []);
                setState('ready');
            }
        } catch {
            // Without the server's list the phone's own record still stands.
            if (alive.current) setState('error');
        } finally {
            inFlight.current = false;
        }
    }, [adapter, orderId]);

    useEffect(() => {
        void load();
    }, [load]);

    /** The item's latest scan, from the server's proofs first and this phone's record second. */
    const scanOf = useCallback(
        (subjectId?: string): ItemScan | undefined => {
            if (!orderId || !subjectId) return undefined;
            let latest: string | undefined;
            for (const proof of proofs ?? []) {
                if (proof.subject_id !== subjectId || !isScanProof(proof) || typeof proof.created_at !== 'string') continue;
                if (!latest || Date.parse(proof.created_at) > Date.parse(latest)) latest = proof.created_at;
            }
            const local = ledger[keyOf(orderId, subjectId)];
            // A scan this phone made after the list was read is the newer one.
            if (local && (!latest || local.at > Date.parse(latest))) {
                return { at: new Date(local.at).toISOString(), queued: local.queued && !latest, source: 'device' };
            }
            return latest ? { at: latest, queued: false, source: 'server' } : undefined;
        },
        // `localVersion` is the dependency that makes a fresh scan show.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [orderId, proofs, localVersion]
    );

    /**
     * Sends one scanned code as proof for one item, the way an order's scan
     * proof is sent: the text the camera read, under the item's id. Either code
     * on the item's label is accepted (see data/scanCode).
     */
    const scan = useCallback(
        async (subjectId: string, code: string): Promise<ProofOutcome> => {
            delete failures[subjectId];
            setIsSending(true);
            setSendFailure(null);
            const result = await sendScan(code, subjectId);
            if (alive.current) setIsSending(false);
            if (result.outcome === 'failed') {
                failures[subjectId] = { failure: result.failure ?? 'other', message: result.message };
                if (alive.current) setSendFailure(result.message ?? result.failure ?? 'failed');
                return result.outcome;
            }
            recordItemScan(orderId, subjectId, { queued: result.outcome === 'queued', proofId: result.proofId });
            if (result.outcome === 'sent') void load();
            return result.outcome;
        },
        [sendScan, load, orderId]
    );

    return {
        scanOf,
        scan,
        isScanning: isSending,
        scanError: sendFailure,
        /** The server's list has not answered yet. */
        isLoading: state === 'idle' || state === 'loading',
        /** The server's list could not be read: only this phone's scans are known. */
        failed: state === 'error',
        reload: load,
    };
}

export default useItemScans;
