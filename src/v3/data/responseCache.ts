/**
 * The last answer each read had, kept so a screen can open with it.
 *
 * Without this every screen opened on a skeleton and waited for the network,
 * even one the driver had looked at a minute before — chat worst of all, where
 * the channel list and then the conversation each made the driver wait in
 * turn. Here a read's answer is kept, the next visit paints it at once, and the
 * request still goes out: when it answers, the screen moves to the new answer;
 * when it fails, what was shown stays.
 *
 * Shape of it:
 *
 *   - **Scoped to the session.** Every key starts with the instance host, the
 *     organisation and the signed-in driver, so another account's answers can
 *     never be read back — not after an organisation switch, not after someone
 *     else signs in on the same phone. With no driver signed in nothing is kept.
 *   - **Synchronous to read.** The index is read from MMKV when this module
 *     loads, and an entry's value the first time it is asked for, so a hook can
 *     seed its first render from it rather than flashing an empty state first.
 *   - **Written behind.** Answers go into memory straight away and reach MMKV a
 *     moment later in one batch, so a screen that fires five reads at once does
 *     not do five disk writes on the JS thread while it is trying to draw.
 *   - **Bounded.** A cap on entries and on bytes, the oldest going first, and a
 *     maximum age after which an entry is not shown (it is still overwritten
 *     by the next answer). One answer too large to be worth keeping is skipped.
 *   - **Only real answers.** Only reads go through here, a queued
 *     acknowledgement is never kept, and a failure is never written, so a bad
 *     moment on the network cannot replace a good answer with nothing.
 *
 * Cleared whole on sign-out and on linking or unlinking an instance (see
 * `clearResponseCache`); FleetbaseProvider does it when the driver goes away.
 */
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { mmkv, V3_PREFIX } from '../api/storage';
import { isQueuedAck } from '../api/NavigatorAdapter';

const INDEX_KEY = `${V3_PREFIX}cache.index`;
const ENTRY_PREFIX = `${V3_PREFIX}cache.e.`;

/** How many answers are kept at most. */
const MAX_ENTRIES = 400;
/** Roughly how much they may take together, measured as JSON characters. */
const MAX_BYTES = 4 * 1024 * 1024;
/** One answer bigger than this is not kept: it would push out dozens of others. */
const MAX_ENTRY_BYTES = 512 * 1024;
/** Older than this an answer is not shown, unless the caller says otherwise. */
export const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** How long writes wait to be batched. */
const FLUSH_DELAY_MS = 800;

type Params = Record<string, unknown> | undefined;

interface Entry {
    /** When the answer arrived. */
    at: number;
    /** Its JSON length, for the byte cap. */
    bytes: number;
    /** Set once read from disk or written in memory; absent until first asked for. */
    value?: unknown;
    loaded: boolean;
}

/** Insertion order is age order: a write deletes and re-adds, so the oldest is first. */
const entries = new Map<string, Entry>();
let totalBytes = 0;
/** Entries written in memory and not yet on disk, with their JSON. */
const dirty = new Map<string, string>();
/** Entries evicted or cleared in memory and not yet removed from disk. */
const removed = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Bumped by every clear. A read that started before a clear and answers after
 * it belongs to the session that was cleared, and must not be written back.
 */
let generation = 0;

/** `host|organisation|driver`, or empty when nobody is signed in. */
let scope = '';

/* ── Hydration ─────────────────────────────────────────────────────────────── */

(function hydrate() {
    try {
        const raw = mmkv.getString(INDEX_KEY);
        if (!raw) return;
        const index = JSON.parse(raw) as [string, number, number][];
        if (!Array.isArray(index)) return;
        // Oldest first, so the map's order is the eviction order.
        index.sort((a, b) => a[1] - b[1]);
        for (const row of index) {
            if (!Array.isArray(row) || typeof row[0] !== 'string') continue;
            const [key, at, bytes] = row;
            entries.set(key, { at: Number(at) || 0, bytes: Number(bytes) || 0, loaded: false });
            totalBytes += Number(bytes) || 0;
        }
    } catch {
        // A corrupt index costs the cache, never the app start.
        entries.clear();
        totalBytes = 0;
    }
})();

/* ── Scope ─────────────────────────────────────────────────────────────────── */

/**
 * Who the cache is answering for. Called by FleetbaseProvider while it renders,
 * before any screen under it does, so the first render of every hook already
 * reads under the right session.
 */
export function setCacheScope(parts: { host?: string; organizationId?: string; driverId?: string }): void {
    scope = parts.driverId ? [parts.host ?? '', parts.organizationId ?? '', parts.driverId].join('|') : '';
}

/** Mainly for tests and diagnostics. */
export function cacheScope(): string {
    return scope;
}

/* ── Keys ──────────────────────────────────────────────────────────────────── */

/** Params with their keys sorted, so `{a, b}` and `{b, a}` are one entry. */
function stable(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
        .filter((k) => record[k] !== undefined)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${stable(record[k])}`)
        .join(',')}}`;
}

function keyFor(path: string, params: Params): string | null {
    if (!scope) return null;
    return `${scope}|${path}|${stable(params)}`;
}

/* ── Reading ───────────────────────────────────────────────────────────────── */

export interface CacheOptions {
    /** Older than this the entry is not shown. Defaults to seven days. */
    maxAgeMs?: number;
}

/** The kept answer and when it arrived, or undefined when there is none worth showing. */
export function peekCacheEntry<T = unknown>(path: string, params?: Params, { maxAgeMs = DEFAULT_MAX_AGE_MS }: CacheOptions = {}): { value: T; at: number } | undefined {
    const key = keyFor(path, params);
    if (!key) return undefined;
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.at > maxAgeMs) return undefined;
    if (!entry.loaded) {
        try {
            const raw = mmkv.getString(ENTRY_PREFIX + key);
            if (raw === undefined) {
                // The index knew of it but the value is gone: forget it.
                drop(key);
                return undefined;
            }
            entry.value = JSON.parse(raw);
            entry.loaded = true;
        } catch {
            drop(key);
            return undefined;
        }
    }
    return { value: entry.value as T, at: entry.at };
}

/** The kept answer, or undefined. Synchronous, so it can seed a first render. */
export function peekCache<T = unknown>(path: string, params?: Params, options?: CacheOptions): T | undefined {
    return peekCacheEntry<T>(path, params, options)?.value;
}

/**
 * State that opens on the kept answer for a read.
 *
 * `read` turns the kept answer into what the hook holds (the same unwrapping
 * it does on a fresh one) and may say undefined for an answer it does not
 * accept. When the read changes (another order, another channel), the state is
 * seeded again from that read's kept answer if there is one, and otherwise
 * keeps what it held, which is what these hooks did before there was a cache.
 */
export function useCachedState<T>(
    path: string | undefined,
    params: Params,
    read: (raw: unknown, at: number) => T | null | undefined,
    { fallback = null, ...options }: CacheOptions & { fallback?: T | null } = {}
): [T | null, (next: T | null | ((previous: T | null) => T | null)) => void] {
    const key = path ? `${path}|${stable(params)}` : '';
    const seedOf = (): T | undefined => {
        if (!path) return undefined;
        const kept = peekCacheEntry(path, params, options);
        if (!kept) return undefined;
        const value = read(kept.value, kept.at);
        return value === null ? undefined : value;
    };
    const [state, setState] = useState<{ key: string; value: T | null }>(() => ({ key, value: seedOf() ?? fallback }));

    let current = state;
    if (state.key !== key) {
        // Adjusting state while rendering is React's own pattern for state derived from a prop; it re-renders before committing.
        const seeded = seedOf();
        current = { key, value: seeded !== undefined ? seeded : state.value };
        setState(current);
    }

    const set = useCallback((next: T | null | ((previous: T | null) => T | null)) => {
        setState((previous) => ({ key: previous.key, value: typeof next === 'function' ? (next as (p: T | null) => T | null)(previous.value) : next }));
    }, []);

    return [current.value, set];
}

/* ── Writing ───────────────────────────────────────────────────────────────── */

function drop(key: string): void {
    const entry = entries.get(key);
    if (!entry) return;
    totalBytes -= entry.bytes;
    entries.delete(key);
    dirty.delete(key);
    removed.add(key);
    scheduleFlush();
}

function store(key: string, value: unknown): void {
    if (value === undefined || value === null || isQueuedAck(value)) return;
    let json: string;
    try {
        json = JSON.stringify(value);
    } catch {
        return;
    }
    if (json.length > MAX_ENTRY_BYTES) {
        // Too large to keep; what was kept before is no longer true either.
        drop(key);
        return;
    }
    const previous = entries.get(key);
    if (previous) {
        totalBytes -= previous.bytes;
        entries.delete(key);
    }
    entries.set(key, { at: Date.now(), bytes: json.length, value, loaded: true });
    totalBytes += json.length;
    removed.delete(key);
    dirty.set(key, json);

    // Oldest first, until both caps hold.
    for (const oldest of entries.keys()) {
        if (entries.size <= MAX_ENTRIES && totalBytes <= MAX_BYTES) break;
        if (oldest === key) break;
        drop(oldest);
    }
    scheduleFlush();
}

/**
 * Keeps a value as the answer for a read, under the current session. For a
 * hook that changed what it holds without asking the server again — a
 * preference switched, a message sent — so the next visit opens on that.
 */
export function putCache(path: string, params: Params, value: unknown): void {
    const key = keyFor(path, params);
    if (key) store(key, value);
}

/** Forgets one read's answer. */
export function evictCache(path: string, params?: Params): void {
    const key = keyFor(path, params);
    if (key) drop(key);
}

type Getter = { get: (path: string, query?: Record<string, unknown>) => Promise<unknown> };

export interface CachedGetOptions {
    /**
     * Part of the cache key but not sent: what the answer depends on beyond
     * the request itself (the order's status for its next activity, say).
     */
    keyParams?: Record<string, unknown>;
    /** What to keep, when it should not be the whole answer (a channel's last messages only). */
    keep?: (raw: unknown) => unknown;
}

/**
 * A GET whose answer is kept for next time. Resolves and rejects exactly as
 * `adapter.get` does, so a hook can swap one for the other; a failure leaves
 * the kept answer as it was.
 */
export async function cachedGet(adapter: Getter, path: string, params?: Record<string, unknown>, { keyParams, keep }: CachedGetOptions = {}): Promise<unknown> {
    // Fixed now: an answer that lands after a sign-out or a switch must not be filed under whoever is signed in by then.
    const key = keyFor(path, keyParams ? { ...(params ?? {}), ...keyParams } : params);
    const startedIn = generation;
    const raw = await adapter.get(path, params);
    if (key && startedIn === generation && key.startsWith(`${scope}|`) && scope) {
        store(key, keep ? keep(raw) : raw);
    }
    return raw;
}

/** The cache key params `cachedGet` used, for `peekCache` to read the same entry. */
export function cacheParams(params?: Record<string, unknown>, keyParams?: Record<string, unknown>): Params {
    return keyParams ? { ...(params ?? {}), ...keyParams } : params;
}

/* ── Persistence ───────────────────────────────────────────────────────────── */

function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(flushResponseCache, FLUSH_DELAY_MS);
}

/** Writes what is pending to MMKV now. Runs by itself shortly after a write, and when the app leaves the front. */
export function flushResponseCache(): void {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (!dirty.size && !removed.size) return;
    try {
        for (const key of removed) mmkv.remove(ENTRY_PREFIX + key);
        for (const [key, json] of dirty) mmkv.set(ENTRY_PREFIX + key, json);
        const index: [string, number, number][] = [];
        for (const [key, entry] of entries) index.push([key, entry.at, entry.bytes]);
        mmkv.set(INDEX_KEY, JSON.stringify(index));
    } catch {
        // A full disk loses the cache's latest answers, which the network will give again.
    }
    removed.clear();
    dirty.clear();
}

/**
 * Forgets every kept answer, in memory and on disk, for every session. Used on
 * sign-out and when the app is linked to another instance or back.
 */
export function clearResponseCache(): void {
    generation += 1;
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    entries.clear();
    dirty.clear();
    removed.clear();
    totalBytes = 0;
    try {
        for (const key of mmkv.getAllKeys()) {
            if (key === INDEX_KEY || key.startsWith(ENTRY_PREFIX)) mmkv.remove(key);
        }
    } catch {
        // Nothing more to do: the in-memory side, which is what screens read, is already empty.
    }
}

// Whatever is pending goes to disk before the OS can stop the app in the background.
AppState.addEventListener('change', (state) => {
    if (state !== 'active') flushResponseCache();
});
