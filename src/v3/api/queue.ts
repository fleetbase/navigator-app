/**
 * Durable outbound mutation queue.
 *
 * A driver completing a stop in a basement must not lose the work. v2 had no
 * queue at all — every action was a bare network call — so signal loss at a stop
 * lost the completion, the proof and the exception alike.
 *
 * Design decisions worth knowing:
 *
 * - **Strictly sequential, head-of-line blocking.** Order is load-bearing: an
 *   arrival must reach the server before the completion that follows it. A
 *   failed entry stops the flush rather than letting later entries overtake it.
 * - **Idempotency keys are generated at enqueue, not at send.** A retry must
 *   reuse the key of the original attempt or the server sees two distinct
 *   operations. This is what makes "replays with no duplicate side effects"
 *   true rather than hopeful.
 * - **Only mutations queue.** A failed GET is re-fetched by whatever needed it;
 *   queuing reads would replay stale requests on reconnect.
 * - **4xx does not retry.** A client error will fail identically forever; it is
 *   parked as `failed` for the sync-queue screen to surface.
 */
import { readJSON, writeJSON } from './storage';

export type QueueStatus = 'pending' | 'syncing' | 'failed';

export interface QueuedMutation {
    id: string;
    /** Reused across every retry — the server dedupes on this. */
    idempotencyKey: string;
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    body?: unknown;
    /** Driver-facing description for the sync-queue screen. */
    label: string;
    /**
     * Translation key for `label`. Stored rather than a translated string
     * because the label is written at enqueue and read much later — freezing
     * English here would survive a language change.
     */
    labelKey?: string;
    createdAt: number;
    attempts: number;
    status: QueueStatus;
    lastError?: string;
    /** HTTP status of the last failure, when there was a response at all. */
    lastStatus?: number;
    /**
     * The driver this work belongs to.
     *
     * Signing out clears the token but leaves the queue on the device, so
     * without this a fuel report filed by one driver would be sent with the
     * *next* driver's token — the server would attribute their work to someone
     * who never did it. Misattributed work is worse than lost work, because
     * nobody can tell it happened.
     *
     * Optional because items written before this existed have no owner; those
     * are treated as belonging to whoever is signed in, which is the behaviour
     * they already had.
     */
    ownerId?: string;
}

export interface QueueSnapshot {
    items: QueuedMutation[];
    pendingCount: number;
    failedCount: number;
    isFlushing: boolean;
    /**
     * Bumped on every change, including ones that alter an item *in place*.
     *
     * Counts alone are not enough to tell whether anything moved: a retry takes
     * `attempts` from 1 to 2 and sets `lastError` while the item stays pending,
     * so pendingCount, failedCount, isFlushing and items.length are all
     * unchanged. A subscriber comparing only those would keep serving a stale
     * snapshot and never show the attempt climbing — which is precisely what the
     * sync-queue screen exists to display.
     */
    revision: number;
}

const STORAGE_KEY = 'api.queue';

/** Give up retrying after this many attempts; the entry parks as `failed`. */
export const MAX_ATTEMPTS = 8;

export type SendFn = (item: QueuedMutation) => Promise<{ ok: true } | { ok: false; status?: number; message: string }>;

let counter = 0;

/**
 * Not crypto — this only needs to be unique per device. Math.random is avoided
 * so the value stays reproducible under test via `setIdFactory`.
 */
let makeId = (): string => {
    counter += 1;
    return `q_${Date.now().toString(36)}_${counter.toString(36)}`;
};

/** Test seam. */
export function setIdFactory(fn: () => string) {
    makeId = fn;
}

export class MutationQueue {
    private items: QueuedMutation[];
    private listeners = new Set<(s: QueueSnapshot) => void>();
    private flushing = false;
    /** Monotonic; see QueueSnapshot.revision. */
    private revision = 0;
    private send: SendFn | null = null;

    constructor() {
        this.items = readJSON<QueuedMutation[]>(STORAGE_KEY, []);
        // Anything caught mid-flight by a crash or a cold start is pending again;
        // the idempotency key makes re-sending safe.
        let changed = false;
        for (const item of this.items) {
            if (item.status === 'syncing') {
                item.status = 'pending';
                changed = true;
            }
        }
        if (changed) this.persist();
    }

    /** Wired by NavigatorAdapter — the queue does not know how to talk HTTP. */
    setSender(send: SendFn) {
        this.send = send;
    }

    snapshot(): QueueSnapshot {
        return {
            // Copy the *items*, not just the array. `[...this.items]` shares
            // every object, so a retry mutating `attempts` in place changed
            // snapshots already handed out — including the one React is
            // rendering from, which useSyncExternalStore requires to be stable.
            items: this.items.map((item) => ({ ...item })),
            pendingCount: this.items.filter((i) => i.status !== 'failed').length,
            failedCount: this.items.filter((i) => i.status === 'failed').length,
            isFlushing: this.flushing,
            revision: this.revision,
        };
    }

    subscribe(fn: (s: QueueSnapshot) => void): () => void {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }

    enqueue(input: {
        method: QueuedMutation['method'];
        path: string;
        body?: unknown;
        label: string;
        labelKey?: string;
        idempotencyKey?: string;
        ownerId?: string;
    }): QueuedMutation {
        const item: QueuedMutation = {
            id: makeId(),
            idempotencyKey: input.idempotencyKey ?? makeId(),
            method: input.method,
            path: input.path,
            body: input.body,
            label: input.label,
            labelKey: input.labelKey,
            createdAt: Date.now(),
            attempts: 0,
            status: 'pending',
            ownerId: input.ownerId,
        };
        this.items.push(item);
        this.persist();
        return item;
    }

    /**
     * Send everything pending, oldest first, stopping at the first failure.
     * Safe to call concurrently — overlapping calls collapse into one pass.
     */
    /**
     * Who is signed in now. Items belonging to anyone else are left alone
     * rather than sent under the wrong credentials.
     */
    private ownerId: string | undefined;

    setOwner(ownerId?: string): void {
        if (this.ownerId === ownerId) return;
        this.ownerId = ownerId;
        this.notify();
    }

    /** Items this driver can actually send. */
    private isMine(item: QueuedMutation): boolean {
        return item.ownerId === undefined || item.ownerId === this.ownerId;
    }

    /** Work waiting that belongs to someone else, and so cannot be sent here. */
    strandedCount(): number {
        return this.items.filter((i) => !this.isMine(i)).length;
    }

    async flush(): Promise<void> {
        if (this.flushing || !this.send) return;
        this.flushing = true;
        this.notify();

        try {
            // Re-read `this.items` each iteration: an enqueue during a flush
            // must be picked up, not skipped by a stale snapshot.
            for (;;) {
                const item = this.items.find((i) => i.status === 'pending' && this.isMine(i));
                if (!item) break;

                item.status = 'syncing';
                item.attempts += 1;
                this.persist();

                const result = await this.send(item);

                if (result.ok) {
                    this.items = this.items.filter((i) => i.id !== item.id);
                    this.persist();
                    continue;
                }

                item.lastError = result.message;
                item.lastStatus = result.status;

                const permanent = typeof result.status === 'number' && result.status >= 400 && result.status < 500 && result.status !== 408 && result.status !== 429;

                if (permanent || item.attempts >= MAX_ATTEMPTS) {
                    // Park it. It stays in the log so the sync-queue screen can
                    // show the driver what did not go through, and why.
                    item.status = 'failed';
                    this.persist();
                    continue;
                }

                // Transient: put it back and stop, so ordering holds.
                item.status = 'pending';
                this.persist();
                break;
            }
        } finally {
            this.flushing = false;
            this.notify();
        }
    }

    /** Move parked entries back to pending — the Retry affordance. */
    retryFailed(): void {
        let changed = false;
        for (const item of this.items) {
            if (item.status === 'failed') {
                item.status = 'pending';
                item.attempts = 0;
                changed = true;
            }
        }
        if (changed) this.persist();
    }

    /** Drop one entry — the driver choosing to discard a failed action. */
    discard(id: string): void {
        const before = this.items.length;
        this.items = this.items.filter((i) => i.id !== id);
        if (this.items.length !== before) this.persist();
    }

    clear(): void {
        this.items = [];
        this.persist();
    }

    private persist() {
        writeJSON(STORAGE_KEY, this.items);
        this.notify();
    }

    private notify() {
        this.revision += 1;
        const snap = this.snapshot();
        for (const fn of this.listeners) fn(snap);
    }
}

/** One queue per app. */
export const mutationQueue = new MutationQueue();
