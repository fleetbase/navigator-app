/**
 * Payload item (entity) detail, and its scan history.
 *
 * Two facts from a live instance shape this hook:
 *
 *   - Entities embedded in an order's payload arrive **sparse** — on the dev
 *     instance every one has `id: null`, `tracking_number: null` and null
 *     dimensions/weight. `GET /v1/entities/{id}` returns the fuller record, so
 *     the embedded copy is used as an immediate seed and the fetch fills in.
 *   - Scan history is not an entity sub-resource. It lives on the entity's
 *     tracking number: `GET /v1/tracking-statuses?tracking_number={id}`. An
 *     entity without one has no history to show, which is a real state, not an
 *     error.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFleetbase } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';
import { entityIdOf } from './accessors';

export type EntityRecord = Record<string, unknown>;

export interface ScanEvent {
    id: string;
    status?: string;
    details?: string;
    code?: string;
    complete?: boolean;
    city?: string;
    province?: string;
    country?: string;
    created_at?: string;
}

export type EntityLoadState = 'idle' | 'loading' | 'ready' | 'error';

function unwrap(raw: unknown): unknown {
    return (raw as { data?: unknown })?.data ?? raw;
}

/** The tracking number's own id — what scan history is keyed by. */
export function trackingRecordIdOf(entity?: EntityRecord | null): string | undefined {
    const tn = entity?.tracking_number;
    if (tn && typeof tn === 'object') {
        const id = (tn as { id?: unknown }).id;
        if (typeof id === 'string' && id) return id;
    }
    return undefined;
}

export function useEntity(entityId?: string | null, seed?: EntityRecord | null) {
    const { adapter } = useFleetbase();
    const [fetched, setFetched] = useState<EntityRecord | null>(null);
    const [state, setState] = useState<EntityLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);

    const id = entityId ?? entityIdOf(seed);

    const load = useCallback(async () => {
        if (!id || inFlight.current) return;
        inFlight.current = true;
        setState('loading');
        setError(null);
        try {
            const data = unwrap(await adapter.get(`entities/${id}`));
            setFetched((data ?? null) as EntityRecord | null);
            setState('ready');
        } catch (err) {
            setError(err as ApiError);
            setState('error');
        } finally {
            inFlight.current = false;
        }
    }, [adapter, id]);

    useEffect(() => {
        void load();
    }, [load]);

    /**
     * The fetched record wins field-by-field, but the seed survives where the
     * fetch is silent — so a sparse response never blanks out what the order
     * payload already showed.
     */
    const entity = useMemo<EntityRecord | null>(() => {
        if (!seed && !fetched) return null;
        return { ...(seed ?? {}), ...(fetched ?? {}) };
    }, [seed, fetched]);

    return {
        entity,
        state,
        error,
        /** Only a hard failure with nothing to fall back on is a dead end. */
        isBlocked: state === 'error' && !seed,
        isLoading: state === 'loading' && !seed && !fetched,
        retry: load,
    };
}

export function useScanHistory(trackingRecordId?: string | null) {
    const { adapter } = useFleetbase();
    const [events, setEvents] = useState<ScanEvent[] | null>(null);
    const [state, setState] = useState<EntityLoadState>('idle');
    const inFlight = useRef(false);

    const load = useCallback(async () => {
        if (!trackingRecordId) {
            // No tracking number: nothing to fetch, and nothing is wrong.
            setEvents([]);
            setState('ready');
            return;
        }
        if (inFlight.current) return;
        inFlight.current = true;
        setState('loading');
        try {
            const raw = unwrap(await adapter.get('tracking-statuses', { tracking_number: trackingRecordId }));
            const rows = Array.isArray(raw) ? raw : [];
            // Newest first — the driver cares about the last scan.
            setEvents(
                [...(rows as ScanEvent[])].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
            );
            setState('ready');
        } catch {
            // History is supporting detail; failing to load it must not take
            // the screen down. The section renders its own unavailable state.
            setEvents(null);
            setState('error');
        } finally {
            inFlight.current = false;
        }
    }, [adapter, trackingRecordId]);

    useEffect(() => {
        void load();
    }, [load]);

    return { events, state, isLoading: state === 'loading', failed: state === 'error', retry: load };
}
