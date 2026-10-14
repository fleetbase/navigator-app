/**
 * Auto-arrival — the second half of R2 C6.
 *
 * "Inside the geofence Navigator arrives you automatically and shows a
 * 10-second undo instead of this sheet." The socket's geofence event names a
 * geofence, not a stop, and the public stop resource carries no geofence id,
 * so matching the two is guesswork. What the app *does* know is its own fix
 * and the stop's coordinate — the same check the manual sheet runs — so
 * arrival is proposed from that: when the device sits inside the arrival
 * radius of the current pending stop, a countdown starts; unless the driver
 * undoes it, the stop is marked arrived with `arrival_check: 'auto'`.
 *
 * Deliberately conservative: one proposal per stop (an undo is respected for
 * the rest of that stop), nothing while the stop is already arrived or done,
 * and nothing without a fix.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ManifestStopRecord } from './manifestStore';
import { checkArrival, type LatLng } from './routeGeo';

export const AUTO_ARRIVE_UNDO_MS = 10_000;

export type AutoArriveState =
    | { kind: 'idle' }
    | { kind: 'pending'; stopId: string; endsAt: number }
    | { kind: 'arrived'; stopId: string };

export function useAutoArrive(
    stop: ManifestStopRecord | undefined,
    position: LatLng | null | undefined,
    onArrive: (stop: ManifestStopRecord) => Promise<unknown> | void,
    options: { enabled?: boolean; undoMs?: number; now?: () => number } = {}
) {
    const { enabled = true, undoMs = AUTO_ARRIVE_UNDO_MS, now = () => Date.now() } = options;
    const [state, setState] = useState<AutoArriveState>({ kind: 'idle' });
    const dismissed = useRef<Set<string>>(new Set());
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onArriveRef = useRef(onArrive);
    onArriveRef.current = onArrive;

    const clear = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
    };

    useEffect(() => {
        if (!enabled || !stop || stop.status !== 'pending' || dismissed.current.has(stop.id)) return;
        if (state.kind !== 'idle') return;
        const check = checkArrival(stop, position);
        if (check.kind !== 'in-range') return;

        const endsAt = now() + undoMs;
        setState({ kind: 'pending', stopId: stop.id, endsAt });
        clear();
        timer.current = setTimeout(() => {
            timer.current = null;
            setState({ kind: 'arrived', stopId: stop.id });
            void onArriveRef.current(stop);
        }, undoMs);
    }, [enabled, stop, position, state.kind, undoMs, now]);

    // A different stop becoming current resets the proposal.
    useEffect(() => {
        if (state.kind !== 'idle' && state.stopId !== stop?.id) {
            clear();
            setState({ kind: 'idle' });
        }
    }, [stop?.id, state]);

    useEffect(() => clear, []);

    const undo = useCallback(() => {
        if (state.kind !== 'pending') return;
        clear();
        dismissed.current.add(state.stopId);
        setState({ kind: 'idle' });
    }, [state]);

    return { state, undo };
}
