/**
 * Manifests — R1 frames s02/s03, R2 frames B1–B3, C4, C6.
 *
 * What the driver-facing API carries, verified in `routes.php` at v0.6.65:
 *
 *   GET   /v1/drivers/{id}/manifests      list, no stops, newest date first
 *   GET   /v1/manifests/{id}              with stops in driving order, place inline
 *   PATCH /v1/manifest-stops/{id}         { status: arrived|completed|skipped, meta? }
 *   POST  /v1/manifests/{id}/optimize     { latitude?, longitude? } — applies at once
 *
 * A stop update is queueable: arriving in a basement is exactly the mutation
 * the queue exists for, and the status is reflected locally so the driver can
 * carry on. Optimise is **not** queueable — it re-sequences from a position,
 * and replaying that an hour later from wherever the driver was then would
 * reorder a route nobody asked to reorder.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFleetbase, isQueuedAck } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';
import { useLiveRefresh } from '../realtime/liveRefresh';
import { dayKey } from './orderStore';
import {
    manifestStore,
    ManifestStore,
    type ManifestRecord,
    type ManifestStopRecord,
    type ManifestStopStatus,
} from './manifestStore';
import { isStopDone, type LatLng } from './routeGeo';

export type ManifestLoadState = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

function unwrap(raw: unknown): unknown {
    return (raw as { data?: unknown })?.data ?? raw;
}

function rowsOf(raw: unknown): unknown[] {
    const body = unwrap(raw);
    return Array.isArray(body) ? body : [];
}

/* -- Selectors ------------------------------------------------------------ */

function useStoreSelector<T>(store: ManifestStore, select: (s: ManifestStore) => T): T {
    const getSnapshot = useCallback(() => select(store), [store, select]);
    return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function useAllManifests(store: ManifestStore = manifestStore): ManifestRecord[] {
    return useStoreSelector(store, useCallback((s: ManifestStore) => s.all(), []));
}

export function useManifestRecord(id: string | undefined, store: ManifestStore = manifestStore): ManifestRecord | undefined {
    return useStoreSelector(store, useCallback((s: ManifestStore) => (id ? s.get(id) : undefined), [id]));
}

export function useManifestStop(
    manifestId: string | undefined,
    stopId: string | undefined,
    store: ManifestStore = manifestStore
): ManifestStopRecord | undefined {
    return useStoreSelector(
        store,
        useCallback((s: ManifestStore) => (manifestId && stopId ? s.stop(manifestId, stopId) : undefined), [manifestId, stopId])
    );
}

/* -- Derivations ---------------------------------------------------------- */

/**
 * `scheduled_date` is a date cast, serialised as midnight UTC. Reading it back
 * through `Date` in a negative-offset timezone lands on the evening before, so
 * the day is taken from the string when it is there to take.
 */
export function scheduledDayOf(manifest?: Pick<ManifestRecord, 'scheduled_date'> | null): string | undefined {
    const raw = manifest?.scheduled_date;
    if (!raw) return undefined;
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw));
    return m ? m[1] : dayKey(String(raw));
}

export type ManifestBucket = 'today' | 'upcoming' | 'past';

/**
 * Today, upcoming, past — R2 B1's three segments. A manifest still in progress
 * belongs to today whatever its date says: yesterday's unfinished route is the
 * one the driver is on.
 */
export function bucketOf(manifest: ManifestRecord, today: string = dayKey()): ManifestBucket {
    if (manifest.status === 'in_progress') return 'today';
    const day = scheduledDayOf(manifest);
    if (!day || day === today) return 'today';
    return day > today ? 'upcoming' : 'past';
}

export function groupManifests(manifests: ManifestRecord[], today: string = dayKey()): Record<ManifestBucket, ManifestRecord[]> {
    const groups: Record<ManifestBucket, ManifestRecord[]> = { today: [], upcoming: [], past: [] };
    for (const m of manifests) groups[bucketOf(m, today)].push(m);
    // Today and upcoming read forwards in time; past reads backwards.
    const asc = (a: ManifestRecord, b: ManifestRecord) => String(a.scheduled_date ?? '').localeCompare(String(b.scheduled_date ?? ''));
    groups.today.sort(asc);
    groups.upcoming.sort(asc);
    groups.past.sort((a, b) => asc(b, a));
    return groups;
}

/** The stop the driver is at or heading to: an arrived one, else the first pending. */
export function currentManifestStop(stops: ManifestStopRecord[]): ManifestStopRecord | undefined {
    return stops.find((s) => s.status === 'arrived') ?? stops.find((s) => !isStopDone(s) && s.status !== 'arrived');
}

export interface ManifestProgress {
    total: number;
    completed: number;
    pending: number;
    /** Index into the ordered stops of the current stop, for the progress bar. */
    currentIndex?: number;
}

/**
 * Counts from the stops when they are loaded, since an optimistic local
 * update changes them; from the manifest's own counters otherwise.
 */
export function manifestProgress(manifest?: ManifestRecord | null): ManifestProgress {
    const stops = manifest?.stops;
    if (stops?.length) {
        const completed = stops.filter(isStopDone).length;
        const current = currentManifestStop(stops);
        return {
            total: stops.length,
            completed,
            pending: stops.length - completed,
            currentIndex: current ? stops.indexOf(current) : undefined,
        };
    }
    const total = Number(manifest?.stop_count ?? 0) || 0;
    const completed = Number(manifest?.completed_stops ?? 0) || 0;
    return { total, completed, pending: Math.max(0, total - completed) };
}

/* -- Queries -------------------------------------------------------------- */

export function useManifests(driverId?: string, reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [state, setState] = useState<ManifestLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);
    const loaded = useRef(false);

    const load = useCallback(
        async (mode: 'loading' | 'refreshing' = 'loading') => {
            if (!driverId || inFlight.current) return;
            inFlight.current = true;
            setState(mode);
            setError(null);
            try {
                const raw = await adapter.get(`drivers/${driverId}/manifests`, { limit: 30 });
                manifestStore.upsertMany(rowsOf(raw) as ManifestRecord[]);
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
        [adapter, driverId, reloadToken]
    );

    const revision = useLiveRefresh();
    useEffect(() => {
        void load(loaded.current ? 'refreshing' : 'loading');
    }, [load, revision]);

    const manifests = useAllManifests();

    return {
        manifests,
        state,
        error,
        isLoading: state === 'loading' && !manifests.length,
        isRefreshing: state === 'refreshing',
        failed: state === 'error',
        refresh: useCallback(() => load('refreshing'), [load]),
        retry: useCallback(() => load('loading'), [load]),
    };
}

export function useManifest(manifestId?: string, reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [state, setState] = useState<ManifestLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);
    const loaded = useRef(false);

    const load = useCallback(
        async (mode: 'loading' | 'refreshing' = 'loading') => {
            if (!manifestId || inFlight.current) return;
            inFlight.current = true;
            setState(mode);
            setError(null);
            try {
                const raw = unwrap(await adapter.get(`manifests/${manifestId}`)) as ManifestRecord;
                if (raw?.id) manifestStore.upsert({ ...raw, stops: raw.stops ?? [] });
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
        [adapter, manifestId, reloadToken]
    );

    const revision = useLiveRefresh();
    useEffect(() => {
        void load(loaded.current ? 'refreshing' : 'loading');
    }, [load, revision]);

    const manifest = useManifestRecord(manifestId);

    return {
        manifest,
        stops: manifest?.stops ?? [],
        state,
        error,
        isLoading: state === 'loading' && !manifest?.stops,
        isRefreshing: state === 'refreshing',
        failed: state === 'error',
        refresh: useCallback(() => load('refreshing'), [load]),
        retry: useCallback(() => load('loading'), [load]),
    };
}

/* -- Mutations ------------------------------------------------------------ */

export type StopUpdateOutcome = 'sent' | 'queued' | 'failed';

export interface StopUpdateInput {
    status: ManifestStopStatus;
    /** Written to the stop's `meta` — the arrival position, a skip reason. */
    meta?: Record<string, unknown>;
}

/**
 * Arrive, complete or skip a stop. Queued updates are reflected locally so the
 * route keeps moving; the server's row replaces the reflection when it lands.
 */
export function useStopUpdate(manifestId?: string) {
    const { adapter } = useFleetbase();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const update = useCallback(
        async (stop: ManifestStopRecord, input: StopUpdateInput): Promise<StopUpdateOutcome> => {
            if (!manifestId) return 'failed';
            setIsSaving(true);
            setError(null);
            try {
                const body: Record<string, unknown> = { status: input.status };
                if (input.meta) body.meta = { ...(stop.meta ?? {}), ...input.meta };
                const result = await adapter.patch(`manifest-stops/${stop.id}`, body);
                if (isQueuedAck(result)) {
                    manifestStore.updateStop(manifestId, stop.id, {
                        status: input.status,
                        ...(input.status === 'arrived' ? { actual_arrival: new Date().toISOString() } : {}),
                        ...(input.meta ? { meta: body.meta as Record<string, unknown> } : {}),
                    });
                    return 'queued';
                }
                const row = unwrap(result) as ManifestStopRecord;
                manifestStore.updateStop(manifestId, stop.id, row?.id ? row : { status: input.status });
                return 'sent';
            } catch (err) {
                setError((err as Error).message);
                return 'failed';
            } finally {
                setIsSaving(false);
            }
        },
        [adapter, manifestId]
    );

    return { update, isSaving, error };
}

export type OptimiseOutcome = 'applied' | 'failed';

/**
 * Applies the server's own re-sequence. The preview the driver confirmed was
 * computed locally with the same heuristic; the server's answer is what is
 * stored, and it replaces the manifest wholesale.
 */
export function useOptimiseManifest(manifestId?: string) {
    const { adapter } = useFleetbase();
    const [isApplying, setIsApplying] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);

    const apply = useCallback(
        async (from?: LatLng | null): Promise<OptimiseOutcome> => {
            if (!manifestId) return 'failed';
            setIsApplying(true);
            setError(null);
            try {
                const body = from ? { latitude: from.latitude, longitude: from.longitude } : {};
                const raw = unwrap(await adapter.post(`manifests/${manifestId}/optimize`, body)) as ManifestRecord;
                if (raw?.id) manifestStore.upsert({ ...raw, stops: raw.stops ?? [] });
                return 'applied';
            } catch (err) {
                setError(err as ApiError);
                return 'failed';
            } finally {
                setIsApplying(false);
            }
        },
        [adapter, manifestId]
    );

    return { apply, isApplying, error };
}
