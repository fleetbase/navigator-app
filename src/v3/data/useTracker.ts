/**
 * Order tracker — the data behind Today (R1 s01/s12) and the Route tab.
 *
 * `GET /v1/orders/{id}/tracker` returns far more than the app previously used,
 * and several of its fields exist precisely so the client does **not** have to
 * guess:
 *
 *   - **`lifecycle.show_live_eta` / `show_start_eta`** — the server decides
 *     which ETA is meaningful. A dispatched-but-not-started order has no live
 *     ETA at all; it has an estimated *start*. Picking that client-side would
 *     mean showing a confident arrival time for a job nobody has begun.
 *   - **`insights.is_location_stale`** and `warnings` — the server says when the
 *     driver's position is too old to compute from. The instance answered with
 *     a location 42,850 seconds old, so this is not hypothetical: an ETA drawn
 *     from it must be labelled, not presented as fact.
 *   - **`capabilities`** — whether this deployment has traffic, per-leg ETAs,
 *     map matching and route geometry at all.
 *
 * This module keeps that structure rather than flattening it, so a screen can
 * be honest about which parts it actually has.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFleetbase } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';

export interface TrackerStop {
    uuid?: string;
    public_id?: string;
    type?: 'pickup' | 'dropoff' | 'waypoint' | string;
    status?: string | null;
    completed?: boolean;
    sequence?: number;
    address?: string | null;
    name?: string | null;
    latitude?: number;
    longitude?: number;
    location?: { type?: string; coordinates?: number[] } | null;
}

export interface TrackerProgress {
    percentage?: number;
    completed_stops?: number;
    remaining_stops?: number;
    total_stops?: number;
    completed_distance_m?: number | null;
    remaining_distance_m?: number | null;
}

export interface TrackerLifecycle {
    status?: string;
    mode?: string;
    message?: string;
    is_terminal?: boolean;
    has_started?: boolean;
    /** The server's decision about which ETA is meaningful — do not second-guess. */
    show_live_eta?: boolean;
    show_start_eta?: boolean;
    start_at?: string | null;
}

export interface TrackerEta {
    active_stop_seconds?: number | null;
    completion_seconds?: number | null;
    active_stop_at?: string | null;
    completion_at?: string | null;
    start_seconds?: number | null;
    start_at?: string | null;
}

export interface TrackerInsights {
    is_delayed?: boolean;
    delay_seconds?: number;
    is_location_stale?: boolean;
    is_off_route?: boolean;
}

export interface TrackerCapabilities {
    traffic?: boolean;
    per_leg_eta?: boolean;
    map_matching?: boolean;
    route_geometry?: boolean;
}

export interface TrackerRecord {
    provider?: string;
    generated_at?: string;
    confidence?: 'high' | 'medium' | 'low' | string;
    warnings?: string[];
    driver?: { location?: { coordinates?: number[] } | null; location_age_seconds?: number; online?: boolean };
    progress?: TrackerProgress;
    lifecycle?: TrackerLifecycle;
    stops?: TrackerStop[];
    active_stop?: TrackerStop | null;
    next_stop?: TrackerStop | null;
    route?: { distance_m?: number; duration_s?: number; duration_in_traffic_s?: number };
    eta?: TrackerEta;
    insights?: TrackerInsights;
    capabilities?: TrackerCapabilities;
}

/**
 * Which ETA to put in front of the driver, and what it means.
 *
 * `none` is a real answer: a dispatched order that has not started has no
 * arrival time worth showing, and inventing one from the last-known position
 * would be worse than saying nothing.
 */
export type EtaKind = 'live' | 'start' | 'none';

export interface ChosenEta {
    kind: EtaKind;
    seconds?: number | null;
    at?: string | null;
    /** True when the position it was computed from is too old to trust. */
    stale: boolean;
}

export function chooseEta(tracker?: TrackerRecord | null): ChosenEta {
    const lifecycle = tracker?.lifecycle;
    const eta = tracker?.eta;
    const stale = !!tracker?.insights?.is_location_stale;

    if (lifecycle?.show_live_eta && (eta?.active_stop_seconds != null || eta?.active_stop_at)) {
        return { kind: 'live', seconds: eta?.active_stop_seconds, at: eta?.active_stop_at, stale };
    }
    if (lifecycle?.show_start_eta && (eta?.start_seconds != null || eta?.start_at)) {
        return { kind: 'start', seconds: eta?.start_seconds, at: eta?.start_at, stale };
    }
    return { kind: 'none', stale };
}

/** The stop the driver is heading to now — active first, then next. */
export function currentStop(tracker?: TrackerRecord | null): TrackerStop | undefined {
    return tracker?.active_stop ?? tracker?.next_stop ?? tracker?.stops?.find((s) => !s.completed);
}

export function useTracker(orderId?: string, reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [tracker, setTracker] = useState<TrackerRecord | null>(null);
    const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);

    const load = useCallback(async () => {
        if (!orderId || inFlight.current) return;
        inFlight.current = true;
        setState('loading');
        setError(null);
        try {
            const raw = await adapter.get(`orders/${orderId}/tracker`);
            setTracker((((raw as { data?: unknown })?.data ?? raw) ?? null) as TrackerRecord | null);
            setState('ready');
        } catch (err) {
            setError(err as ApiError);
            setState('error');
        } finally {
            inFlight.current = false;
        }
    }, [adapter, orderId]);

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, reloadToken]);

    return {
        tracker,
        state,
        error,
        isLoading: state === 'loading' && !tracker,
        failed: state === 'error',
        retry: load,
    };
}
