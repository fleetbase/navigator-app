/**
 * Which order steps already have their inspection.
 *
 * An order config can say a step needs an inspection filed (`require_inspection`,
 * with the form in `inspection_form`). The inspection is filled in on the
 * inspection screens, away from the order; the advance happens afterwards, back
 * on the order, and sends the submission's id with the update so the server can
 * check it. This records the inspection against the (order, activity) pair, as
 * `proofLedger` does for proof, so the order screen can see it and go on.
 *
 * An inspection queued without signal has no id yet, and the server refuses a
 * step without one. It is recorded as queued with the queue entry that carries
 * it; once the queue has sent it, `useOrderInspection` asks the server for the
 * submission filed for the step and records its id. Until then the step waits,
 * and the order screen says why. No id is ever made up.
 *
 * Persisted: an inspection filed just before the app was killed still counts.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from '../api/storage';
import { mutationQueue } from '../api/queue';
import { useFleetbase } from '../api';

/** What the inspection screens need to know when they are opened for an order's step. */
export interface InspectionOrderContext {
    orderId: string;
    activityCode: string;
    /** The step's name, as the order screen says it. */
    activityLabel: string;
    /** The order's tracking number, for the screens' banner. */
    trackingNumber?: string;
}

export interface InspectionRecord {
    /** The submission's id, once the server has it. */
    submissionId?: string;
    /** Filed without signal: waiting in the queue to be sent. */
    queued: boolean;
    /** The queue entry carrying it, while it waits. */
    queueId?: string;
    /** The key the queue sends it with; the server keeps it on the submission. */
    idempotencyKey?: string;
    formId?: string;
    /** The inspection found the vehicle unsafe: the step is held. */
    unsafe: boolean;
    at: number;
    /** Set by a fresh inspection; the order screen advances once, then clears it. */
    autoAdvance: boolean;
}

const STORAGE_KEY = 'data.inspectionLedger';
let ledger: Record<string, InspectionRecord> = readJSON<Record<string, InspectionRecord>>(STORAGE_KEY, {});
let revision = 0;
const listeners = new Set<() => void>();

const keyOf = (orderId: string, activityCode: string) => `${orderId}::${activityCode}`;

function commit(next: Record<string, InspectionRecord>) {
    ledger = next;
    revision += 1;
    writeJSON(STORAGE_KEY, ledger);
    for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function recordInspection(
    orderId: string,
    activityCode: string,
    inspection: { submissionId?: string; queued?: boolean; queueId?: string; idempotencyKey?: string; formId?: string; unsafe?: boolean }
): void {
    if (!orderId || !activityCode) return;
    commit({
        ...ledger,
        [keyOf(orderId, activityCode)]: {
            submissionId: inspection.submissionId,
            queued: !!inspection.queued,
            queueId: inspection.queueId,
            idempotencyKey: inspection.idempotencyKey,
            formId: inspection.formId,
            unsafe: !!inspection.unsafe,
            at: Date.now(),
            autoAdvance: true,
        },
    });
}

export function inspectionFor(orderId?: string, activityCode?: string): InspectionRecord | undefined {
    if (!orderId || !activityCode) return undefined;
    const entry = ledger[keyOf(orderId, activityCode)];
    // An inspection the server answered without an id cannot be sent with the
    // step, which the server would then refuse. It is not counted, so the
    // driver is asked again rather than left with a step that never goes on.
    if (entry && !entry.submissionId && !entry.queued) return undefined;
    return entry;
}

/** The queued inspection has reached the server: its id, and what it found. */
export function resolveInspection(orderId: string, activityCode: string, submissionId: string, unsafe?: boolean): void {
    const key = keyOf(orderId, activityCode);
    const entry = ledger[key];
    if (!entry) return;
    // The window for advancing by itself counts from now, when it was sent.
    commit({ ...ledger, [key]: { ...entry, submissionId, queued: false, queueId: undefined, unsafe: unsafe ?? entry.unsafe, at: Date.now() } });
}

/** Same window as proof: opening the order the next morning should not fire a step unasked. */
const AUTO_ADVANCE_WINDOW_MS = 10 * 60 * 1000;

/** True once per inspection that can be sent with its step: the order screen should advance now. */
export function takeInspectionAutoAdvance(orderId?: string, activityCode?: string, now: number = Date.now()): boolean {
    const entry = inspectionFor(orderId, activityCode);
    if (!entry?.autoAdvance || !entry.submissionId || entry.unsafe || !orderId || !activityCode) return false;
    if (now - entry.at > AUTO_ADVANCE_WINDOW_MS) return false;
    commit({ ...ledger, [keyOf(orderId, activityCode)]: { ...entry, autoAdvance: false } });
    return true;
}

/** The step went through, or the driver is filing it again; the inspection is spent. */
export function clearInspection(orderId: string, activityCode: string): void {
    const key = keyOf(orderId, activityCode);
    if (!(key in ledger)) return;
    const next = { ...ledger };
    delete next[key];
    commit(next);
}

/** Resets between tests; not used by the app. */
export function resetInspectionLedger(): void {
    commit({});
}

/** The record for an order's step, kept current as it is filed, sent and spent. */
export function useInspectionRecord(orderId?: string, activityCode?: string): InspectionRecord | undefined {
    const get = useCallback(() => revision, []);
    useSyncExternalStore(subscribe, get, get);
    return inspectionFor(orderId, activityCode);
}

export type OrderInspectionState = 'none' | 'sending' | 'notSent' | 'filed' | 'unsafe';

/**
 * Where the inspection for an order's step stands, and the work of finding the
 * id of one that was queued.
 *
 * While the queue still holds the submission it is `sending`, or `notSent`
 * when the queue gave up on it (the sync queue screen can retry it). Once the
 * entry is gone the server is asked for the inspections filed for the step,
 * and the one sent with the queue's key (else the newest) is recorded.
 */
export function useOrderInspection(orderId?: string, activityCode?: string) {
    const { adapter } = useFleetbase();
    const record = useInspectionRecord(orderId, activityCode);
    const [queueStatus, setQueueStatus] = useState<'pending' | 'failed' | 'gone' | null>(null);
    const asking = useRef(false);

    const queueId = record?.queued ? record.queueId : undefined;
    useEffect(() => {
        if (!queueId) {
            setQueueStatus(null);
            return;
        }
        const read = () => {
            const item = mutationQueue.snapshot().items.find((i) => i.id === queueId);
            setQueueStatus(!item ? 'gone' : item.status === 'failed' ? 'failed' : 'pending');
        };
        read();
        return mutationQueue.subscribe(read);
    }, [queueId]);

    const idempotencyKey = record?.idempotencyKey;
    const resolve = useCallback(async () => {
        if (!orderId || !activityCode || asking.current) return;
        asking.current = true;
        try {
            const raw = await adapter.get('inspections', { order: orderId, activity: activityCode, limit: 10 });
            const body = (raw as { data?: unknown })?.data ?? raw;
            const rows = (Array.isArray(body) ? body : []) as { id?: string; status?: string | null; meta?: Record<string, unknown> | null }[];
            const sent = rows.find((row) => idempotencyKey && row.meta?.idempotency_key === idempotencyKey) ?? rows.find((row) => row.status !== 'draft');
            if (sent?.id) resolveInspection(orderId, activityCode, sent.id, Boolean(sent.meta?.unsafe));
        } catch {
            // Asked again on the next change of the queue or the next visit.
        } finally {
            asking.current = false;
        }
    }, [adapter, orderId, activityCode, idempotencyKey]);

    useEffect(() => {
        if (record?.queued && (queueStatus === 'gone' || !record.queueId)) void resolve();
    }, [record?.queued, record?.queueId, queueStatus, resolve]);

    const state: OrderInspectionState = !record
        ? 'none'
        : record.unsafe
          ? 'unsafe'
          : record.submissionId
            ? 'filed'
            : queueStatus === 'failed'
              ? 'notSent'
              : 'sending';

    return { record, state };
}
