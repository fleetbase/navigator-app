/**
 * Durable key/value for the v3 tree.
 *
 * A thin wrapper rather than a reuse of src/hooks/use-storage.ts: that module
 * carries pre-existing type errors (it does not compile under the v3 strict
 * program) and mutates its MMKV instance via Object.assign to bolt on a legacy
 * API. Both instances address the same underlying native store, so v2 and v3
 * read each other's keys during the parallel period.
 *
 * Keys written here are namespaced `v3.` so a cutover — or a rollback — can
 * clear one tree's state without touching the other.
 */
import { createMMKV } from 'react-native-mmkv';

const mmkv = createMMKV();

export const V3_PREFIX = 'v3.';

const k = (key: string) => (key.startsWith(V3_PREFIX) ? key : `${V3_PREFIX}${key}`);

export function readJSON<T>(key: string, fallback: T): T {
    const raw = mmkv.getString(k(key));
    if (raw === undefined) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        // Corrupt entry: prefer the fallback over throwing on app start.
        return fallback;
    }
}

export function writeJSON(key: string, value: unknown): void {
    mmkv.set(k(key), JSON.stringify(value));
}

export function remove(key: string): void {
    mmkv.remove(k(key));
}

/** Clear only v3 state — used by sign-out and by a cutover rollback. */
export function clearV3(): void {
    for (const key of mmkv.getAllKeys()) {
        if (key.startsWith(V3_PREFIX)) mmkv.remove(key);
    }
}

export { mmkv };
