/**
 * Duty state — off / on / break.
 *
 * Replaces the v2 binary online `Switch`, which conflated "reachable by
 * dispatch" with "working". The design's pill has three states.
 *
 * Only two of them have backing today: `POST drivers/{id}/toggle-online` covers
 * off↔on. Break requires the shift endpoints promoted in Phase 4a
 * (`POST /v1/drivers/{id}/shift/start|end|break`), so `breakSupported` is false
 * until then and the UI disables the option rather than faking it — the design's
 * rule is that config-driven surfaces degrade honestly.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type DutyState = 'off' | 'on' | 'break';

export interface DutyContextValue {
    duty: DutyState;
    /** True while a transition is in flight. */
    isChanging: boolean;
    /** False until the Phase 4a shift endpoints land. */
    breakSupported: boolean;
    setDuty: (next: DutyState) => Promise<void>;
    error: Error | null;
}

const DutyContext = createContext<DutyContextValue | null>(null);

export interface DutyProviderProps {
    children: React.ReactNode;
    /** Current online flag from the driver resource. */
    isOnline?: boolean;
    /** Wraps AuthContext.toggleOnline. Injected so the shell stays testable. */
    onToggleOnline?: (online: boolean) => Promise<unknown>;
    /** Flip on once the shift endpoints exist. */
    breakSupported?: boolean;
}

export function DutyProvider({ children, isOnline = false, onToggleOnline, breakSupported = false }: DutyProviderProps) {
    const [duty, setLocalDuty] = useState<DutyState>(isOnline ? 'on' : 'off');
    const [isChanging, setIsChanging] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const setDuty = useCallback(
        async (next: DutyState) => {
            if (next === 'break' && !breakSupported) {
                setError(new Error('Break is not available for this organisation yet.'));
                return;
            }

            const previous = duty;
            setError(null);
            setIsChanging(true);
            // Optimistic: the pill is the driver's primary feedback that the tap
            // registered. Rolled back below if the call fails.
            setLocalDuty(next);

            try {
                if (next !== 'break' && onToggleOnline) {
                    await onToggleOnline(next === 'on');
                }
            } catch (err) {
                setLocalDuty(previous);
                setError(err as Error);
            } finally {
                setIsChanging(false);
            }
        },
        [duty, breakSupported, onToggleOnline]
    );

    const value = useMemo<DutyContextValue>(
        () => ({ duty, isChanging, breakSupported, setDuty, error }),
        [duty, isChanging, breakSupported, setDuty, error]
    );

    return <DutyContext.Provider value={value}>{children}</DutyContext.Provider>;
}

export function useDuty(): DutyContextValue {
    const ctx = useContext(DutyContext);
    if (!ctx) throw new Error('useDuty must be used within a DutyProvider');
    return ctx;
}
