/**
 * Inspections / DVIR — R2 frames E2, E3a–E3d, E4, E5.
 *
 * The driver-facing contract, being added to FleetOps on
 * `feature/inspections-driver-api` (a draft PR taking over fleetops#267):
 *
 *   GET  /v1/inspection-forms?vehicle=&type=   published forms for a vehicle
 *   GET  /v1/inspection-forms/{id}
 *   POST /v1/inspections                        submit; mirrors the public runner's body
 *   GET  /v1/inspections?driver=&vehicle=       history
 *   GET  /v1/inspections/{id}                   one submission with item results
 *
 * An instance without the feature answers 404 to the list. The screens read
 * that as "not enabled" (invariant 8), never as an error.
 *
 * **Everything before submit lives on the device.** A pre-trip check is done
 * in a yard with no signal, is interrupted by a phone call, and is finished
 * after a cold start — so the draft is a persisted store, not component
 * state. Photos are kept as base64 for the same reason proof capture keeps
 * them that way: a file path cannot be re-read at replay time. Submit goes
 * through the adapter and queues like any other mutation; the queued receipt
 * is kept so the history can show it as *queued · will sync*.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFleetbase, isQueuedAck } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';
import { readJSON, writeJSON } from '../api/storage';
import { useLiveRefresh } from '../realtime/liveRefresh';
import type { GeoPoint } from '../shell/LocationContext';

/* -- Shapes --------------------------------------------------------------- */

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];

/** One checklist item, as the console's form builder writes it into `items`. */
export interface InspectionFormItem {
    key: string;
    label: string;
    description?: string | null;
    category?: string | null;
    required?: boolean;
    /** The builder's default severity for a defect on this item. */
    severity?: Severity | string | null;
}

export interface InspectionFormSettings {
    create_issue_on_failure?: boolean;
    create_work_order_on_failure?: boolean;
    require_signature?: boolean;
    require_odometer?: boolean;
    /** Severity at or above which a photo is required on a defect. Default `high`. */
    photo_required_from?: Severity;
    [key: string]: unknown;
}

export interface InspectionFormRecord {
    id: string;
    name?: string | null;
    description?: string | null;
    type?: string | null;
    status?: string | null;
    frequency?: string | null;
    items?: InspectionFormItem[] | null;
    settings?: InspectionFormSettings | null;
    subject_name?: string | null;
    item_count?: number;
    is_published?: boolean;
    published_at?: string | null;
    [key: string]: unknown;
}

export interface InspectionItemResultRecord {
    id?: string;
    item_key?: string | null;
    label: string;
    category?: string | null;
    status?: string | null;
    severity?: string | null;
    passed: boolean;
    comments?: string | null;
    photos?: string[] | null;
}

export interface InspectionSubmissionRecord {
    id: string;
    type?: string | null;
    status?: string | null;
    result?: 'passed' | 'failed' | string | null;
    source?: string | null;
    odometer?: number | null;
    engine_hours?: number | null;
    total_items?: number | null;
    failed_items?: number | null;
    has_failures?: boolean;
    started_at?: string | null;
    submitted_at?: string | null;
    form_name?: string | null;
    vehicle_name?: string | null;
    driver_name?: string | null;
    vehicle?: { id?: string; name?: string | null; plate_number?: string | null } | null;
    item_results?: InspectionItemResultRecord[];
    issue?: { id?: string; status?: string | null; priority?: string | null } | null;
    work_order?: { id?: string; status?: string | null } | null;
    meta?: Record<string, unknown> | null;
    /** Set on receipts the app itself keeps for queued submissions. */
    queued?: boolean;
    [key: string]: unknown;
}

/* -- Draft store ----------------------------------------------------------- */

export interface ItemAnswer {
    /** true = pass, false = defect, null = not applicable. Absent = unanswered. */
    passed: boolean | null;
    severity?: Severity;
    comments?: string;
    /** Bare base64. */
    photos: string[];
    /** The driver says the vehicle must not be driven because of this. */
    unsafe?: boolean;
}

export interface InspectionDraft {
    formId: string;
    vehicleId?: string;
    startedAt: string;
    answers: Record<string, ItemAnswer>;
    odometer?: string;
    certified?: boolean;
}

interface DraftState {
    byKey: Record<string, InspectionDraft>;
    /** Receipts for submissions that queued offline, newest first. */
    pending: InspectionSubmissionRecord[];
    version: number;
}

const DRAFT_KEY = 'data.inspectionDrafts';

export const draftKey = (formId: string, vehicleId?: string) => `${formId}:${vehicleId ?? '-'}`;

export class InspectionDraftStore {
    private state: DraftState;
    private listeners = new Set<() => void>();

    constructor(initial?: DraftState) {
        this.state = initial ?? readJSON<DraftState>(DRAFT_KEY, { byKey: {}, pending: [], version: 0 });
    }

    subscribe = (fn: () => void): (() => void) => {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    };

    getState = (): DraftState => this.state;

    get(formId: string, vehicleId?: string): InspectionDraft | undefined {
        return this.state.byKey[draftKey(formId, vehicleId)];
    }

    /** The draft, created on first read so a checklist always has one to write into. */
    start(formId: string, vehicleId?: string, now: () => Date = () => new Date()): InspectionDraft {
        const existing = this.get(formId, vehicleId);
        if (existing) return existing;
        const draft: InspectionDraft = { formId, vehicleId, startedAt: now().toISOString(), answers: {} };
        this.commit({ byKey: { ...this.state.byKey, [draftKey(formId, vehicleId)]: draft } });
        return draft;
    }

    answer(formId: string, vehicleId: string | undefined, itemKey: string, answer: ItemAnswer): void {
        const draft = this.start(formId, vehicleId);
        const next = { ...draft, answers: { ...draft.answers, [itemKey]: answer } };
        this.commit({ byKey: { ...this.state.byKey, [draftKey(formId, vehicleId)]: next } });
    }

    patch(formId: string, vehicleId: string | undefined, patch: Partial<Pick<InspectionDraft, 'odometer' | 'certified'>>): void {
        const draft = this.start(formId, vehicleId);
        this.commit({ byKey: { ...this.state.byKey, [draftKey(formId, vehicleId)]: { ...draft, ...patch } } });
    }

    discard(formId: string, vehicleId?: string): void {
        const byKey = { ...this.state.byKey };
        delete byKey[draftKey(formId, vehicleId)];
        this.commit({ byKey });
    }

    /** All drafts, most recently started first — the hub's "resume" list. */
    all(): InspectionDraft[] {
        return Object.values(this.state.byKey).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    }

    addPending(receipt: InspectionSubmissionRecord): void {
        this.commit({ pending: [receipt, ...this.state.pending].slice(0, 50) });
    }

    /** Once the server lists a submission the local receipt has done its job. */
    reconcilePending(server: InspectionSubmissionRecord[]): void {
        if (!this.state.pending.length) return;
        const keys = new Set(server.map((s) => String(s.meta?.client_key ?? '')));
        const pending = this.state.pending.filter((p) => !keys.has(String(p.meta?.client_key ?? '')));
        if (pending.length !== this.state.pending.length) this.commit({ pending });
    }

    pendingReceipts(): InspectionSubmissionRecord[] {
        return this.state.pending;
    }

    clear(): void {
        this.commit({ byKey: {}, pending: [] });
    }

    private commit(patch: Partial<DraftState>): void {
        this.state = { ...this.state, ...patch, version: this.state.version + 1 };
        writeJSON(DRAFT_KEY, this.state);
        for (const fn of this.listeners) fn();
    }
}

export const inspectionDrafts = new InspectionDraftStore();

function useDraftSelector<T>(store: InspectionDraftStore, select: (s: InspectionDraftStore) => T): T {
    const get = useCallback(() => select(store), [store, select]);
    return useSyncExternalStore(store.subscribe, get, get);
}

export function useInspectionDraft(formId?: string, vehicleId?: string, store: InspectionDraftStore = inspectionDrafts) {
    // Version-aware: the selector re-runs on every commit because `getState` changes identity.
    const state = useDraftSelector(store, useCallback((s: InspectionDraftStore) => s.getState(), []));
    return formId ? state.byKey[draftKey(formId, vehicleId)] : undefined;
}

export function useInspectionDrafts(store: InspectionDraftStore = inspectionDrafts): InspectionDraft[] {
    const state = useDraftSelector(store, useCallback((s: InspectionDraftStore) => s.getState(), []));
    return Object.values(state.byKey).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function usePendingInspections(store: InspectionDraftStore = inspectionDrafts): InspectionSubmissionRecord[] {
    const state = useDraftSelector(store, useCallback((s: InspectionDraftStore) => s.getState(), []));
    return state.pending;
}

/* -- Derivations ---------------------------------------------------------- */

export const UNCATEGORISED = 'general';

export interface ItemGroup {
    category: string;
    items: InspectionFormItem[];
    answered: number;
}

/** The checklist by area, in the order the form declares them (E3a). */
export function groupItems(form?: InspectionFormRecord | null, draft?: InspectionDraft | null): ItemGroup[] {
    const groups = new Map<string, ItemGroup>();
    for (const item of form?.items ?? []) {
        const category = (item.category ?? '').trim() || UNCATEGORISED;
        const group = groups.get(category) ?? { category, items: [], answered: 0 };
        group.items.push(item);
        if (draft?.answers[item.key] !== undefined) group.answered += 1;
        groups.set(category, group);
    }
    return [...groups.values()];
}

export function severityRank(severity?: string | null): number {
    const i = SEVERITIES.indexOf(String(severity ?? '').toLowerCase() as Severity);
    return i < 0 ? 1 : i;
}

export function highestSeverity(draft?: InspectionDraft | null): Severity | undefined {
    let best: Severity | undefined;
    for (const a of Object.values(draft?.answers ?? {})) {
        if (a.passed !== false) continue;
        const s = a.severity ?? 'medium';
        if (!best || severityRank(s) > severityRank(best)) best = s;
    }
    return best;
}

export interface DraftProgress {
    total: number;
    answered: number;
    passed: number;
    defects: number;
    notApplicable: number;
    complete: boolean;
    /** Items marked required by the form that have no answer. */
    missingRequired: InspectionFormItem[];
}

export function draftProgress(form?: InspectionFormRecord | null, draft?: InspectionDraft | null): DraftProgress {
    const items = form?.items ?? [];
    let answered = 0;
    let passed = 0;
    let defects = 0;
    let notApplicable = 0;
    const missingRequired: InspectionFormItem[] = [];
    for (const item of items) {
        const a = draft?.answers[item.key];
        if (a === undefined) {
            if (item.required !== false) missingRequired.push(item);
            continue;
        }
        answered += 1;
        if (a.passed === true) passed += 1;
        else if (a.passed === false) defects += 1;
        else notApplicable += 1;
    }
    return { total: items.length, answered, passed, defects, notApplicable, complete: items.length > 0 && missingRequired.length === 0, missingRequired };
}

/** The first item without an answer, in form order — where "Next item" goes. */
export function nextUnanswered(form?: InspectionFormRecord | null, draft?: InspectionDraft | null): InspectionFormItem | undefined {
    return (form?.items ?? []).find((item) => draft?.answers[item.key] === undefined);
}

/**
 * A defect on a high-or-worse severity marks the vehicle unsafe (E3d), and so
 * does the driver saying so on any defect.
 */
export function isUnsafe(draft?: InspectionDraft | null, settings?: InspectionFormSettings | null): boolean {
    const threshold = settings?.photo_required_from ?? 'high';
    for (const a of Object.values(draft?.answers ?? {})) {
        if (a.passed !== false) continue;
        if (a.unsafe) return true;
        if (severityRank(a.severity ?? 'medium') >= severityRank(threshold)) return true;
    }
    return false;
}

/** E3b: photo required for high and above; a note is always required on a defect. */
export function photoRequiredFor(severity: Severity | undefined, settings?: InspectionFormSettings | null): boolean {
    return severityRank(severity ?? 'medium') >= severityRank(settings?.photo_required_from ?? 'high');
}

export function defectComplete(answer: ItemAnswer, settings?: InspectionFormSettings | null): boolean {
    if (answer.passed !== false) return true;
    if (!answer.severity) return false;
    if (!(answer.comments ?? '').trim()) return false;
    if (photoRequiredFor(answer.severity, settings) && !answer.photos.length) return false;
    return true;
}

/* -- Submission body — mirrors PublicInspectionController@submit ------------ */

export interface SubmissionContext {
    driverId: string;
    vehicleId?: string;
    location?: GeoPoint | null;
    signature?: { image?: string; name?: string; signed_at: string } | null;
    now?: () => Date;
}

export function buildSubmission(form: InspectionFormRecord, draft: InspectionDraft, ctx: SubmissionContext): Record<string, unknown> {
    const now = ctx.now ?? (() => new Date());
    const item_results = (form.items ?? []).map((item) => {
        const a = draft.answers[item.key];
        const passed = a?.passed !== false;
        const na = a?.passed === null;
        return {
            item_key: item.key,
            label: item.label,
            category: item.category ?? null,
            status: na ? 'not_applicable' : passed ? 'passed' : 'failed',
            severity: passed ? null : (a?.severity ?? item.severity ?? 'medium'),
            passed,
            comments: a?.comments?.trim() || null,
            photos: a?.photos ?? [],
        };
    });
    const odometer = draft.odometer != null && draft.odometer !== '' && Number.isFinite(Number(draft.odometer)) ? Math.round(Number(draft.odometer)) : null;
    return {
        inspection_form: form.id,
        driver: ctx.driverId,
        vehicle: ctx.vehicleId ?? draft.vehicleId ?? null,
        odometer,
        engine_hours: null,
        started_at: draft.startedAt,
        item_results,
        location: ctx.location ?? null,
        signature: ctx.signature ?? null,
        attachments: [],
        meta: {
            source_app: 'navigator',
            client_key: draftKey(form.id, ctx.vehicleId ?? draft.vehicleId),
            unsafe: isUnsafe(draft, form.settings),
            submitted_at_device: now().toISOString(),
        },
    };
}

/* -- Queries -------------------------------------------------------------- */

export type InspectionLoadState = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

function unwrap(raw: unknown): unknown {
    return (raw as { data?: unknown })?.data ?? raw;
}
function rowsOf(raw: unknown): unknown[] {
    const body = unwrap(raw);
    return Array.isArray(body) ? body : [];
}

/** True when the instance does not have the feature at all. */
export function isNotEnabled(error?: ApiError | null): boolean {
    return error?.status === 404;
}

export function useInspectionForms(vehicleId?: string | null, reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [forms, setForms] = useState<InspectionFormRecord[] | null>(null);
    const [state, setState] = useState<InspectionLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);

    const load = useCallback(
        async (mode: 'loading' | 'refreshing' = 'loading') => {
            if (inFlight.current) return;
            inFlight.current = true;
            setState(mode);
            setError(null);
            try {
                const raw = await adapter.get('inspection-forms', { ...(vehicleId ? { vehicle: vehicleId } : {}), limit: 30 });
                const rows = rowsOf(raw) as InspectionFormRecord[];
                setForms(rows.filter((f) => f.is_published !== false && f.status !== 'archived' && f.status !== 'draft'));
                setState('ready');
            } catch (err) {
                setError(err as ApiError);
                setState('error');
            } finally {
                inFlight.current = false;
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [adapter, vehicleId, reloadToken]
    );

    useEffect(() => {
        void load(forms ? 'refreshing' : 'loading');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    return {
        forms: forms ?? [],
        state,
        error,
        isLoading: state === 'loading' && !forms,
        failed: state === 'error',
        notEnabled: state === 'error' && isNotEnabled(error),
        retry: useCallback(() => load('loading'), [load]),
    };
}

export function useInspectionForm(formId?: string | null, seed?: InspectionFormRecord | null) {
    const { adapter } = useFleetbase();
    const [form, setForm] = useState<InspectionFormRecord | null>(seed ?? null);
    const [state, setState] = useState<InspectionLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);

    const load = useCallback(async () => {
        if (!formId) return;
        setState(form ? 'refreshing' : 'loading');
        setError(null);
        try {
            const body = unwrap(await adapter.get(`inspection-forms/${formId}`)) as InspectionFormRecord;
            if (body?.id) setForm(body);
            setState('ready');
        } catch (err) {
            setError(err as ApiError);
            setState('error');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adapter, formId]);

    useEffect(() => {
        void load();
    }, [load]);

    return { form, state, error, isLoading: state === 'loading' && !form, failed: state === 'error', retry: load };
}

export function useInspectionHistory(filter: { driver?: string; vehicle?: string }, reloadToken = 0) {
    const { adapter } = useFleetbase();
    const [submissions, setSubmissions] = useState<InspectionSubmissionRecord[] | null>(null);
    const [state, setState] = useState<InspectionLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);
    const key = JSON.stringify(filter);

    const load = useCallback(
        async (mode: 'loading' | 'refreshing' = 'loading') => {
            const params = JSON.parse(key) as { driver?: string; vehicle?: string };
            if ((!params.driver && !params.vehicle) || inFlight.current) return;
            inFlight.current = true;
            setState(mode);
            setError(null);
            try {
                const raw = await adapter.get('inspections', { ...params, limit: 50, sort: '-submitted_at' });
                const rows = rowsOf(raw) as InspectionSubmissionRecord[];
                rows.sort((a, b) => String(b.submitted_at ?? b.created_at ?? '').localeCompare(String(a.submitted_at ?? a.created_at ?? '')));
                setSubmissions(rows);
                inspectionDrafts.reconcilePending(rows);
                setState('ready');
            } catch (err) {
                setError(err as ApiError);
                setState('error');
            } finally {
                inFlight.current = false;
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [adapter, key, reloadToken]
    );

    const revision = useLiveRefresh();
    useEffect(() => {
        void load(submissions ? 'refreshing' : 'loading');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, revision]);

    return {
        submissions: submissions ?? [],
        state,
        error,
        isLoading: state === 'loading' && !submissions,
        isRefreshing: state === 'refreshing',
        failed: state === 'error',
        notEnabled: state === 'error' && isNotEnabled(error),
        refresh: useCallback(() => load('refreshing'), [load]),
        retry: useCallback(() => load('loading'), [load]),
    };
}

export function useInspectionSubmission(id?: string | null, seed?: InspectionSubmissionRecord | null) {
    const { adapter } = useFleetbase();
    const [submission, setSubmission] = useState<InspectionSubmissionRecord | null>(seed ?? null);
    const [state, setState] = useState<InspectionLoadState>('idle');
    const [error, setError] = useState<ApiError | null>(null);

    const load = useCallback(async () => {
        // A queued receipt has no server record yet; there is nothing to fetch.
        if (!id || seed?.queued) return;
        setState(submission ? 'refreshing' : 'loading');
        setError(null);
        try {
            const body = unwrap(await adapter.get(`inspections/${id}`)) as InspectionSubmissionRecord;
            if (body?.id) setSubmission(body);
            setState('ready');
        } catch (err) {
            setError(err as ApiError);
            setState('error');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adapter, id]);

    useEffect(() => {
        void load();
    }, [load]);

    return { submission, state, error, isLoading: state === 'loading' && !submission, failed: state === 'error', retry: load };
}

/* -- Submit --------------------------------------------------------------- */

export type SubmitOutcome =
    | { kind: 'sent'; submission: InspectionSubmissionRecord }
    | { kind: 'queued'; receipt: InspectionSubmissionRecord }
    | { kind: 'failed'; message: string };

export function useSubmitInspection() {
    const { adapter } = useFleetbase();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const submit = useCallback(
        async (form: InspectionFormRecord, draft: InspectionDraft, ctx: SubmissionContext): Promise<SubmitOutcome> => {
            setIsSubmitting(true);
            try {
                const body = buildSubmission(form, draft, ctx);
                const result = await adapter.post('inspections', body);
                const progress = draftProgress(form, draft);
                if (isQueuedAck(result)) {
                    const receipt: InspectionSubmissionRecord = {
                        id: `queued:${result.id}`,
                        queued: true,
                        type: form.type ?? 'dvir',
                        status: 'queued',
                        result: progress.defects > 0 ? 'failed' : 'passed',
                        source: 'navigator',
                        odometer: (body.odometer as number | null) ?? null,
                        total_items: progress.total,
                        failed_items: progress.defects,
                        has_failures: progress.defects > 0,
                        started_at: draft.startedAt,
                        submitted_at: (body.meta as { submitted_at_device: string }).submitted_at_device,
                        form_name: form.name ?? null,
                        item_results: body.item_results as InspectionItemResultRecord[],
                        meta: body.meta as Record<string, unknown>,
                    };
                    inspectionDrafts.addPending(receipt);
                    inspectionDrafts.discard(form.id, ctx.vehicleId ?? draft.vehicleId);
                    return { kind: 'queued', receipt };
                }
                const payload = unwrap(result) as { submission?: InspectionSubmissionRecord } | InspectionSubmissionRecord;
                const submission = ((payload as { submission?: InspectionSubmissionRecord }).submission ?? payload) as InspectionSubmissionRecord;
                inspectionDrafts.discard(form.id, ctx.vehicleId ?? draft.vehicleId);
                return { kind: 'sent', submission };
            } catch (err) {
                return { kind: 'failed', message: (err as Error).message };
            } finally {
                setIsSubmitting(false);
            }
        },
        [adapter]
    );

    return { submit, isSubmitting };
}
