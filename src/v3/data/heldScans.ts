/**
 * The scans a driver has made for a step, kept on the phone until they are sent
 * and the step has gone through.
 *
 * The proof screen holds one scan per item. It used to hold them only while it
 * was open, so closing it (to check the order, to take a call) threw away every
 * label already read. They are kept here instead, against the order and the
 * step they are proof for, and read back when the screen opens again: the close
 * button can say "your scans are kept" and mean it.
 *
 * Nothing here sends anything, and nothing here decides what a scan is worth:
 * the screen does the first and the server the second. This is only where the
 * screen's own list lives between two visits.
 */
import { readJSON, writeJSON } from '../api/storage';

/*
 * One scanned item.
 *
 *   ready    read by the camera (or typed), not sent yet
 *   sent     the server took it and made a proof
 *   queued   no signal: kept by the app, sent when there is some
 *   unsent   sending failed for a reason that may pass; sent again on the next try
 *   refused  the server read the code and would not take it; not counted
 */
export type HeldStatus = 'ready' | 'sent' | 'queued' | 'unsent' | 'refused';

export interface HeldScan {
    /** Exactly what the camera read: what is sent. */
    code: string;
    /** The item's tracking number: what is shown. */
    label: string;
    at: string;
    /** The item the scan is sent under, when the phone knows its id. */
    subjectId?: string;
    status: HeldStatus;
    proofId?: string;
}

interface Entry {
    at: number;
    scans: Record<string, HeldScan>;
}

const STORAGE_KEY = 'data.heldScans';
/** A shift, roughly: scans older than this belong to a job that is long over. */
const KEEP_MS = 12 * 60 * 60 * 1000;

let store: Record<string, Entry> = readJSON<Record<string, Entry>>(STORAGE_KEY, {});

const keyOf = (orderId: string, activityCode: string, subjectId?: string) => `${orderId}::${activityCode}${subjectId ? `::${subjectId}` : ''}`;

function save() {
    writeJSON(STORAGE_KEY, store);
}

/** The scans kept for this step of this order, if any are recent enough to stand. */
export function heldScansFor(orderId?: string, activityCode?: string, subjectId?: string, now: number = Date.now()): Record<string, HeldScan> {
    if (!orderId || !activityCode) return {};
    const entry = store[keyOf(orderId, activityCode, subjectId)];
    if (!entry || !entry.scans || typeof entry.scans !== 'object') return {};
    if (now - entry.at > KEEP_MS) return {};
    return entry.scans;
}

/** Keeps the step's scans as they now are. Others that have gone stale are dropped on the way. */
export function keepHeldScans(orderId: string | undefined, activityCode: string | undefined, scans: Record<string, HeldScan>, subjectId?: string, now: number = Date.now()): void {
    if (!orderId || !activityCode) return;
    const next: Record<string, Entry> = {};
    for (const key of Object.keys(store)) {
        if (now - (store[key]?.at ?? 0) <= KEEP_MS) next[key] = store[key];
    }
    const key = keyOf(orderId, activityCode, subjectId);
    if (Object.keys(scans).length) next[key] = { at: now, scans };
    else delete next[key];
    store = next;
    save();
}

/** The step's proof has been recorded: its scans are spent. */
export function clearHeldScans(orderId?: string, activityCode?: string, subjectId?: string): void {
    if (!orderId || !activityCode) return;
    const key = keyOf(orderId, activityCode, subjectId);
    if (!(key in store)) return;
    const next = { ...store };
    delete next[key];
    store = next;
    save();
}

/** Resets between tests; not used by the app. */
export function resetHeldScans(): void {
    store = {};
    save();
}
