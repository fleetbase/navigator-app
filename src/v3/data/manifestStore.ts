/**
 * Normalised manifest store.
 *
 * A manifest is a driver's route for a day: an order-agnostic sequence of
 * stops. It is persisted, like orders, because the route is the thing a driver
 * most needs when there is no signal — a loading dock, a basement car park,
 * the far end of a farm track. A route that vanishes on cold start offline is
 * a route the driver has to phone dispatch about.
 *
 * Records are plain JSON keyed by public id. Detail responses carry `stops`;
 * list responses do not, and the merge keeps whatever stops were loaded last
 * so a list refresh never blanks a route the driver is looking at.
 */
import { readJSON, writeJSON } from '../api/storage';

export type ManifestStatus = 'draft' | 'active' | 'in_progress' | 'completed' | 'cancelled';
export type ManifestStopStatus = 'pending' | 'arrived' | 'completed' | 'skipped';

export interface GeoPointLike {
    type?: string;
    coordinates?: number[];
}

/** The public Place projection, as the stop resource inlines it. */
export interface ManifestPlace {
    id?: string;
    name?: string | null;
    address?: string | null;
    location?: GeoPointLike | null;
    street1?: string | null;
    street2?: string | null;
    city?: string | null;
    province?: string | null;
    postal_code?: string | null;
    country?: string | null;
    building?: string | null;
    security_access_code?: string | null;
    phone?: string | null;
    type?: string | null;
    meta?: Record<string, unknown> | null;
    [key: string]: unknown;
}

export interface ManifestStopOrderRef {
    id?: string;
    tracking_number?: string | null;
    status?: string | null;
}

export interface ManifestStopRecord {
    id: string;
    status?: ManifestStopStatus | string;
    sequence?: number;
    estimated_arrival?: string | null;
    actual_arrival?: string | null;
    distance_from_prev_m?: number | null;
    duration_from_prev_s?: number | null;
    place?: ManifestPlace | null;
    order?: ManifestStopOrderRef | null;
    meta?: Record<string, unknown> | null;
    updated_at?: string;
    created_at?: string;
    [key: string]: unknown;
}

export interface ManifestRecord {
    id: string;
    status?: ManifestStatus | string;
    scheduled_date?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
    total_distance_m?: number | null;
    total_duration_s?: number | null;
    stop_count?: number | null;
    completed_stops?: number | null;
    pending_stops?: number | null;
    driver_name?: string | null;
    vehicle_name?: string | null;
    notes?: string | null;
    /** Present only after a detail read. */
    stops?: ManifestStopRecord[];
    updated_at?: string;
    created_at?: string;
    [key: string]: unknown;
}

export interface ManifestStoreState {
    byId: Record<string, ManifestRecord>;
    allIds: string[];
    version: number;
}

const STORAGE_KEY = 'data.manifests';

const EMPTY: ManifestStopRecord[] = [];

export class ManifestStore {
    private state: ManifestStoreState;
    private listeners = new Set<() => void>();
    private cache = new Map<string, { version: number; value: unknown }>();

    constructor(initial?: ManifestStoreState) {
        this.state = initial ?? readJSON<ManifestStoreState>(STORAGE_KEY, { byId: {}, allIds: [], version: 0 });
    }

    subscribe = (fn: () => void): (() => void) => {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    };

    getState = (): ManifestStoreState => this.state;

    upsertMany(manifests: ManifestRecord[]): void {
        if (!manifests.length) return;
        const byId = { ...this.state.byId };
        const allIds = [...this.state.allIds];

        for (const manifest of manifests) {
            if (!manifest?.id) continue;
            if (!(manifest.id in byId)) allIds.push(manifest.id);
            const previous = byId[manifest.id];
            // A list row has no `stops`; keep the ones a detail read loaded.
            const stops = manifest.stops ?? previous?.stops;
            byId[manifest.id] = { ...previous, ...manifest, ...(stops ? { stops: sortStops(stops) } : {}) };
        }

        this.commit({ byId, allIds, version: this.state.version + 1 });
    }

    upsert(manifest: ManifestRecord): void {
        this.upsertMany([manifest]);
    }

    /**
     * Patch one stop in place. Used for the optimistic reflection of a queued
     * arrive/complete/skip, and for the server's own answer when it lands.
     */
    updateStop(manifestId: string, stopId: string, patch: Partial<ManifestStopRecord>): void {
        const manifest = this.state.byId[manifestId];
        if (!manifest?.stops) return;
        const stops = manifest.stops.map((s) => (s.id === stopId ? { ...s, ...patch, id: stopId } : s));
        this.upsert({ ...manifest, stops });
    }

    clear(): void {
        this.commit({ byId: {}, allIds: [], version: this.state.version + 1 });
    }

    get(id: string): ManifestRecord | undefined {
        return this.state.byId[id];
    }

    stopsOf(id: string): ManifestStopRecord[] {
        return this.state.byId[id]?.stops ?? EMPTY;
    }

    stop(manifestId: string, stopId: string): ManifestStopRecord | undefined {
        return this.stopsOf(manifestId).find((s) => s.id === stopId);
    }

    /** Newest scheduled date first; identity-stable until the store changes. */
    all(): ManifestRecord[] {
        return this.view('all', () =>
            this.state.allIds
                .map((id) => this.state.byId[id])
                .filter(Boolean)
                .sort((a, b) => String(b.scheduled_date ?? '').localeCompare(String(a.scheduled_date ?? '')))
        );
    }

    private view<T>(key: string, build: () => T): T {
        const hit = this.cache.get(key);
        if (hit && hit.version === this.state.version) return hit.value as T;
        const value = build();
        this.cache.set(key, { version: this.state.version, value });
        return value;
    }

    private commit(next: ManifestStoreState): void {
        this.state = next;
        writeJSON(STORAGE_KEY, next);
        for (const fn of this.listeners) fn();
    }
}

/** Driving order. `sequence` is what a re-sequence rewrites, so sort on it. */
export function sortStops(stops: ManifestStopRecord[]): ManifestStopRecord[] {
    return [...stops].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

export const manifestStore = new ManifestStore();
