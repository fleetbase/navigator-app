/**
 * Issues — R1 frame s10, R2 frame F3.
 *
 * Two things differ from fuel reports and both matter:
 *
 *   - **`location` is required on create.** `CreateIssueRequest` demands it, so
 *     an issue filed without a fix is rejected by validation. The create screen
 *     therefore has to know whether it has one before it offers to file.
 *   - **The order, the photos and the timeline need FleetOps 0.7.4.** From
 *     there `POST /v1/issues` keeps `order`, the resource returns `order_id`
 *     and `order_tracking_number`, `GET issues/{id}` returns `files`, and
 *     `GET issues/{id}/timeline` exists on the public prefix. An older server
 *     drops the order, returns no files and answers 404 for the timeline, so
 *     all three are read as optional.
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
    /** Public id of the vehicle the reporting driver had at the time. */
    vehicle_id?: string | null;
    assignee_name?: string | null;
    reporter_name?: string | null;
    location?: { type?: string; coordinates?: number[] } | null;
    /** Public id of the order the issue is about. */
    order_id?: string | null;
    order_tracking_number?: string | null;
    /** Photos attached to the issue; only on a single read, not in the list. */
    files?: IssueFile[] | null;
    resolved_at?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface IssueFile {
    id: string;
    url?: string | null;
    original_filename?: string | null;
    content_type?: string | null;
}

/** One entry in an issue's history, as `GET issues/{id}/timeline` returns it. */
export interface IssueTimelineEvent {
    id: string;
    type?: string | null;
    /** The server's own English wording: "Status changed". */
    label?: string | null;
    description?: string | null;
    actor_name?: string | null;
    created_at?: string | null;
    meta?: { field?: string; from?: unknown; to?: unknown; file_name?: string; file_url?: string } | null;
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
    /** Public id of the order the issue is about. */
    order?: string;
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
                if (draft.order) body.order = draft.order;

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

/**
 * Attaches photos to an issue that already exists.
 *
 * The issue endpoints take no files, but the core file endpoint does the job:
 * `POST /v1/files/base64` with `subject_type: fleet-ops:issue` and
 * `subject_id: <issue public id>` stores the image and points it at the issue
 * (File::setSubjectFromRequest resolves the public id inside the session's
 * company), which is the relation the console reads (`Issue::files`).
 *
 * `subject_id`, not `subject_uuid`: the latter is written to the column as
 * given, and a public id there matches nothing.
 *
 * Needs the issue's id, so it cannot run for a report that was queued offline —
 * the screen says photos need a connection rather than pretending to keep them.
 * Returns how many did not upload.
 */
export function useAttachIssuePhotos() {
    const { adapter } = useFleetbase();
    const [isUploading, setIsUploading] = useState(false);

    const attach = useCallback(
        async (issueId: string, photos: string[]): Promise<number> => {
            if (!issueId || !photos.length) return 0;
            setIsUploading(true);
            let failed = 0;
            try {
                for (let i = 0; i < photos.length; i += 1) {
                    try {
                        const result = await adapter.post('files/base64', {
                            data: photos[i],
                            file_name: `issue-${issueId}-${i + 1}.jpg`,
                            file_type: 'image',
                            content_type: 'image/jpeg',
                            subject_type: 'fleet-ops:issue',
                            subject_id: issueId,
                        });
                        if (isQueuedAck(result) || !((result as { data?: { id?: string } })?.data ?? (result as { id?: string }))?.id) failed += 1;
                    } catch {
                        failed += 1;
                    }
                }
            } finally {
                setIsUploading(false);
            }
            return failed;
        },
        [adapter]
    );

    return { attach, isUploading };
}

/**
 * One issue read on its own, with its history.
 *
 * The list row has no photos (the list does not load them) and no history, so
 * the detail screen reads both. Neither read is allowed to cost the screen
 * anything: the row it was opened with is shown meanwhile and stays if a read
 * fails, and a server with no public timeline simply yields no events.
 */
export function useIssueDetail(id?: string, seed?: IssueRecord | null) {
    const { adapter } = useFleetbase();
    const [issue, setIssue] = useState<IssueRecord | null>(seed ?? null);
    const [events, setEvents] = useState<IssueTimelineEvent[]>([]);

    useEffect(() => {
        if (!id) return;
        let live = true;
        (async () => {
            try {
                const raw = (await adapter.get(`issues/${id}`)) as unknown;
                const body = ((raw as { data?: unknown })?.data ?? raw) as IssueRecord | null;
                if (live && body && typeof body === 'object' && !Array.isArray(body) && body.id) setIssue(body);
            } catch {
                // The row passed in is still true.
            }
        })();
        (async () => {
            try {
                const raw = (await adapter.get(`issues/${id}/timeline`)) as { events?: unknown } | null;
                const rows = Array.isArray(raw?.events) ? (raw.events as IssueTimelineEvent[]) : [];
                // Newest first, as the console shows it.
                if (live) setEvents([...rows].filter((e) => !!e?.id).sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))));
            } catch {
                // An older server has no public timeline; the two dates on the record are shown instead.
            }
        })();
        return () => {
            live = false;
        };
    }, [adapter, id]);

    return { issue: issue ?? seed ?? null, events };
}
