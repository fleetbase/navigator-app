/**
 * Issues — R1 frame s10, R2 frame F3.
 *
 * Two things differ from fuel reports and both matter:
 *
 *   - **`location` is required on create.** `CreateIssueRequest` demands it, so
 *     an issue filed without a fix is rejected by validation. The create screen
 *     therefore has to know whether it has one before it offers to file.
 *   - **The status timeline is internal-only.** `GET issues/{id}/timeline` is
 *     registered under the `int/v1` prefix, not the public one, so F3's
 *     "timeline of status changes" cannot be shown to a driver token.
 *
 * The scoping trap from fuel-reports repeats exactly: `driver=<public id>`
 * filters, while `driver_uuid` is *ignored* and returns every issue in the
 * company. A test asserts the parameter name.
 *
 * The list resource is flat — `driver_name`, `vehicle_name`, `assignee_name`
 * are strings, not nested objects, unlike the fuel report's `driver`/`vehicle`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFleetbase, isQueuedAck } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';
import type { GeoPoint } from '../shell/LocationContext';

export interface IssueRecord {
    id: string;
    issue_id?: string;
    title?: string | null;
    report?: string | null;
    priority?: string | null;
    type?: string | null;
    category?: string | null;
    status?: string | null;
    tags?: string[] | null;
    driver_name?: string | null;
    vehicle_name?: string | null;
    assignee_name?: string | null;
    reporter_name?: string | null;
    location?: { type?: string; coordinates?: number[] } | null;
    resolved_at?: string | null;
    created_at?: string;
    updated_at?: string;
}

export type IssueLoadState = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

/** "billing_discrepancies" → "Billing discrepancies". */
export function humanizeTerm(value?: string | null): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const words = value.trim().replace(/[_-]+/g, ' ').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The API stores snake_case; the pickers offer Title Case. */
export function toApiTerm(value?: string | null): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    return value.trim().toLowerCase().replace(/[\s/]+/g, '_');
}

/**
 * What to lead the row and the detail header with.
 *
 * An issue filed from the app has no title and no category — the public create
 * endpoint sets neither — so falling back to a generic word printed "Issue"
 * above the report, and again as the header. When there is nothing better, the
 * driver's own words are the heading, and the caller omits the separate body.
 */
export function headingOf(issue?: IssueRecord | null): { heading: string; usedReport: boolean } {
    const title = typeof issue?.title === 'string' && issue.title.trim() ? issue.title.trim() : undefined;
    if (title) return { heading: title, usedReport: false };

    const category = humanizeTerm(issue?.category);
    if (category) return { heading: category, usedReport: false };

    const report = typeof issue?.report === 'string' ? issue.report.trim() : '';
    if (report) return { heading: report, usedReport: true };

    return { heading: '', usedReport: false };
}

export function useIssues(driverId?: string, reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [issues, setIssues] = useState<IssueRecord[] | null>(null);
    const [state, setState] = useState<IssueLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);

    const load = useCallback(
        async (mode: 'loading' | 'refreshing' = 'loading') => {
            if (!driverId || inFlight.current) return;
            inFlight.current = true;
            setState(mode);
            setError(null);
            try {
                // `driver`, never `driver_uuid` — see the note at the top.
                const raw = (await adapter.get('issues', { driver: driverId, sort: '-created_at', limit: 50 })) as unknown;
                const rows = Array.isArray(raw) ? raw : ((raw as { data?: unknown[] })?.data ?? []);
                setIssues(
                    [...(rows as IssueRecord[])].sort((a, b) =>
                        String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
                    )
                );
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

    useEffect(() => {
        void load(issues ? 'refreshing' : 'loading');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    return {
        issues,
        state,
        error,
        isLoading: state === 'loading' && !issues,
        isRefreshing: state === 'refreshing',
        failed: state === 'error',
        refresh: useCallback(() => load('refreshing'), [load]),
        retry: useCallback(() => load('loading'), [load]),
    };
}

export interface NewIssue {
    report: string;
    type?: string;
    category?: string;
    priority?: string;
    location: GeoPoint;
}

export function useCreateIssue(driverId?: string) {
    const { adapter } = useFleetbase();
    const [isSaving, setIsSaving] = useState(false);
    const [queued, setQueued] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const create = useCallback(
        async (draft: NewIssue): Promise<IssueRecord | null> => {
            if (!driverId) {
                setError('missing-driver');
                return null;
            }
            setIsSaving(true);
            setError(null);
            try {
                const body: Record<string, unknown> = {
                    driver: driverId,
                    report: draft.report.trim(),
                    // Required by CreateIssueRequest — never omitted.
                    location: draft.location,
                };
                if (draft.type) body.type = toApiTerm(draft.type);
                if (draft.category) body.category = toApiTerm(draft.category);
                if (draft.priority) body.priority = toApiTerm(draft.priority);

                const result = await adapter.post('issues', body);
                if (isQueuedAck(result)) {
                    setQueued(true);
                    return null;
                }
                return ((result as { data?: unknown })?.data ?? result) as IssueRecord;
            } catch (err) {
                setError((err as Error).message);
                return null;
            } finally {
                setIsSaving(false);
            }
        },
        [adapter, driverId]
    );

    return { create, isSaving, queued, error };
}
