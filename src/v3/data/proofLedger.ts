/**
 * Which activities already have their proof.
 *
 * Proof is captured before the activity it belongs to, on its own screen; the
 * advance happens afterwards, back on the order. Nothing connected the two, so
 * returning from a successful capture and tapping the advance button asked for
 * the proof *again* — a loop a driver could only escape by giving up. This
 * records the capture against the (order, activity) pair so the advance can
 * see it, send the proof's id with the update the way v2 did, and go.
 *
 * Persisted: a capture made just before the app was killed still counts.
 */
import { readJSON, writeJSON } from '../api/storage';

export interface ProofRecord {
    /** The proof's id, when it was sent; absent when it was queued offline. */
    proofId?: string;
    queued: boolean;
    at: number;
    /** Set by a fresh capture; the order screen advances once, then clears it. */
    autoAdvance: boolean;
}

const STORAGE_KEY = 'data.proofLedger';
let ledger: Record<string, ProofRecord> = readJSON<Record<string, ProofRecord>>(STORAGE_KEY, {});

const keyOf = (orderId: string, activityCode: string) => `${orderId}::${activityCode}`;

function save() {
    writeJSON(STORAGE_KEY, ledger);
}

export function recordProof(orderId: string, activityCode: string, proof: { proofId?: string; queued?: boolean } = {}): void {
    if (!orderId || !activityCode) return;
    ledger = { ...ledger, [keyOf(orderId, activityCode)]: { proofId: proof.proofId, queued: !!proof.queued, at: Date.now(), autoAdvance: true } };
    save();
}

export function proofFor(orderId?: string, activityCode?: string): ProofRecord | undefined {
    if (!orderId || !activityCode) return undefined;
    const entry = ledger[keyOf(orderId, activityCode)];
    // A capture the server answered without an id cannot be handed to the step
    // update, which the server would then refuse. It is not counted, so the
    // driver is asked again rather than left with a step that never completes.
    if (entry && !entry.proofId && !entry.queued) return undefined;
    return entry;
}

/**
 * How long after a capture returning to the order still advances it by itself.
 * Opening the order the next morning should not fire an activity unasked —
 * the proof still counts then, but the tap is the driver's.
 */
const AUTO_ADVANCE_WINDOW_MS = 10 * 60 * 1000;

/** True once per capture: the order screen should advance now. */
export function takeAutoAdvance(orderId?: string, activityCode?: string, now: number = Date.now()): boolean {
    const entry = proofFor(orderId, activityCode);
    if (!entry?.autoAdvance || !orderId || !activityCode) return false;
    if (now - entry.at > AUTO_ADVANCE_WINDOW_MS) return false;
    ledger = { ...ledger, [keyOf(orderId, activityCode)]: { ...entry, autoAdvance: false } };
    save();
    return true;
}

/** The activity went through; its proof is spent. */
export function clearProof(orderId: string, activityCode: string): void {
    const key = keyOf(orderId, activityCode);
    if (!(key in ledger)) return;
    const next = { ...ledger };
    delete next[key];
    ledger = next;
    save();
}

/** Resets between tests; not used by the app. */
export function resetProofLedger(): void {
    ledger = {};
    save();
}
