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

const STATUSES: HeldStatus[] = ['ready', 'sent', 'queued', 'unsent', 'refused'];

/**
 * What was kept is read back by a screen at render, so nothing unexpected may
 * come out of it: an entry written by an older build, or one that is not what
 * it should be, is dropped rather than handed on. A scan stands only with the
 * text that is sent, the label that is shown and a status the screen knows.
 */
function soundScans(value: unknown): Record<string, HeldScan> {
    const scans: Record<string, HeldScan> = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return scans;
    for (const key of Object.keys(value as object)) {
        const scan = (value as Record<string, unknown>)[key] as Partial<HeldScan> | null | undefined;
        if (!scan || typeof scan !== 'object') continue;
        if (typeof scan.code !== 'string' || !scan.code) continue;
        if (!STATUSES.includes(scan.status as HeldStatus)) continue;
        scans[key] = {
            code: scan.code,
            label: typeof scan.label === 'string' && scan.label ? scan.label : scan.code,
            at: typeof scan.at === 'string' ? scan.at : new Date(0).toISOString(),
            status: scan.status as HeldStatus,
            ...(typeof scan.subjectId === 'string' ? { subjectId: scan.subjectId } : {}),
            ...(typeof scan.proofId === 'string' ? { proofId: scan.proofId } : {}),
        };
    }
    return scans;
}

function soundStore(value: unknown): Record<string, Entry> {
    const sound: Record<string, Entry> = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return sound;
    for (const key of Object.keys(value as object)) {
        const entry = (value as Record<string, unknown>)[key] as Partial<Entry> | null | undefined;
        if (!entry || typeof entry !== 'object' || typeof entry.at !== 'number') continue;
        const scans = soundScans(entry.scans);
        if (Object.keys(scans).length) sound[key] = { at: entry.at, scans };
    }
    return sound;
}

function load(): Record<string, Entry> {
    try {
        return soundStore(readJSON<unknown>(STORAGE_KEY, {}));
    } catch {
        return {};
    }
}

let store: Record<string, Entry> = load();

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
