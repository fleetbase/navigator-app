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

/**
 * A field on the form — the second cut's unit. The form builder writes these
 * as platform custom fields, grouped; the driver API answers `grouped_fields`.
 * The first cut's `items` (pass/fail only) are folded into the same shape by
 * `fieldsOf`, so the renderer has one vocabulary.
 */
export type InspectionFieldType =
    | 'pass-fail'
    | 'input'
    | 'textarea'
    | 'number'
    | 'select'
    | 'radio-button'
    | 'boolean'
    | 'date-picker'
    | 'date-time-input'
    | 'file-upload'
    | 'signature';

export interface PassFailMeta {
    severity?: Severity | string | null;
    require_photo_on_fail?: boolean;
    require_comment_on_fail?: boolean;
    unsafe_on_fail?: boolean;
    instructions?: string | null;
}

export interface InspectionField {
    /** Public id of the custom field; the key values are filed under. */
    id: string;
    name?: string | null;
    label: string;
    description?: string | null;
    help_text?: string | null;
    type: InspectionFieldType | string;
    required?: boolean;
    options?: string[] | null;
    order?: number | null;
    meta?: (PassFailMeta & { unit?: string | null; role?: string | null; [key: string]: unknown }) | null;
}

export interface InspectionFieldGroup {
    id?: string | null;
    name: string;
    description?: string | null;
    order?: number | null;
    meta?: { grid_size?: number; [key: string]: unknown } | null;
    fields: InspectionField[];
}

/** First-cut checklist item, still accepted from older forms. */
export interface InspectionFormItem {
    key: string;
    label: string;
    description?: string | null;
    category?: string | null;
    required?: boolean;
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
    /** Legacy, first cut. Read through `fieldsOf`. */
    items?: InspectionFormItem[] | null;
    /** The form proper: groups of typed fields. */
    grouped_fields?: InspectionFieldGroup[] | null;
    settings?: InspectionFormSettings | null;
    subject_name?: string | null;
    item_count?: number;
    is_published?: boolean;
    published_at?: string | null;
    [key: string]: unknown;
}

export interface InspectionFieldValueRecord {
    custom_field?: string;
    label?: string | null;
    type?: string | null;
    value?: unknown;
}

export interface InspectionFileRecord {
    id: string;
    url?: string | null;
    original_filename?: string | null;
    content_type?: string | null;
    type?: string | null;
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
    custom_field_values?: InspectionFieldValueRecord[];
    files?: InspectionFileRecord[];
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

/** A typed field's answer: text, number, boolean, ISO date, or base64 for a photo/signature. */
export type FieldValue = string | number | boolean | null;

export interface InspectionDraft {
    formId: string;
    vehicleId?: string;
    startedAt: string;
    /** Pass/fail fields, keyed by field id. */
    answers: Record<string, ItemAnswer>;
    /** Every other field, keyed by field id. */
    values?: Record<string, FieldValue>;
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

    setValue(formId: string, vehicleId: string | undefined, fieldId: string, value: FieldValue): void {
        const draft = this.start(formId, vehicleId);
        const values = { ...(draft.values ?? {}), [fieldId]: value };
        this.commit({ byKey: { ...this.state.byKey, [draftKey(formId, vehicleId)]: { ...draft, values } } });
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

export function isPassFail(field: Pick<InspectionField, 'type'>): boolean {
    return field.type === 'pass-fail';
}

/**
 * The form as groups of fields, whichever cut wrote it. A first-cut form
 * (`items`, no `grouped_fields`) becomes one group per category of
 * `pass-fail` fields whose id is the item key, so a draft keyed by field id
 * survives the upgrade.
 */
export function groupsOf(form?: InspectionFormRecord | null): InspectionFieldGroup[] {
    const grouped = form?.grouped_fields;
    if (Array.isArray(grouped) && grouped.length) {
        return grouped.map((g) => ({ ...g, name: g.name || UNCATEGORISED, fields: [...(g.fields ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) }));
    }
    const groups = new Map<string, InspectionFieldGroup>();
    for (const item of form?.items ?? []) {
        const name = (item.category ?? '').trim() || UNCATEGORISED;
        const group = groups.get(name) ?? { id: null, name, fields: [] };
        group.fields.push({
            id: item.key,
            name: item.key,
            label: item.label,
            description: item.description ?? null,
            type: 'pass-fail',
            required: item.required !== false,
            meta: { severity: item.severity ?? 'medium', require_comment_on_fail: true },
        });
        groups.set(name, group);
    }
    return [...groups.values()];
}

/** Every field in form order. */
export function fieldsOf(form?: InspectionFormRecord | null): InspectionField[] {
    return groupsOf(form).flatMap((g) => g.fields);
}

export interface ItemGroup {
    group: InspectionFieldGroup;
    answered: number;
}

export function isAnswered(field: InspectionField, draft?: InspectionDraft | null): boolean {
    if (isPassFail(field)) return draft?.answers[field.id] !== undefined;
    const v = draft?.values?.[field.id];
    return v !== undefined && v !== null && v !== '';
}

/** Groups with their answered counts (E3a's "EXTERIOR · 4 OF 6"). */
export function groupItems(form?: InspectionFormRecord | null, draft?: InspectionDraft | null): ItemGroup[] {
    return groupsOf(form).map((group) => ({ group, answered: group.fields.filter((f) => isAnswered(f, draft)).length }));
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
    /** Required fields with no answer. */
    missingRequired: InspectionField[];
}

export function draftProgress(form?: InspectionFormRecord | null, draft?: InspectionDraft | null): DraftProgress {
    const fields = fieldsOf(form);
    let answered = 0;
    let passed = 0;
    let defects = 0;
    let notApplicable = 0;
    const missingRequired: InspectionField[] = [];
    for (const field of fields) {
        if (!isAnswered(field, draft)) {
            if (field.required !== false) missingRequired.push(field);
            continue;
        }
        answered += 1;
        if (isPassFail(field)) {
            const a = draft!.answers[field.id];
            if (a.passed === true) passed += 1;
            else if (a.passed === false) defects += 1;
            else notApplicable += 1;
        }
    }
    return { total: fields.length, answered, passed, defects, notApplicable, complete: fields.length > 0 && missingRequired.length === 0, missingRequired };
}

/** The first field without an answer, in form order — where "Next item" goes. */
export function nextUnanswered(form?: InspectionFormRecord | null, draft?: InspectionDraft | null): InspectionField | undefined {
    return fieldsOf(form).find((field) => !isAnswered(field, draft));
}

/** The field's own rule, else the first cut's "high and above". */
export function unsafeOnFail(field?: InspectionField | null, answer?: ItemAnswer | null): boolean {
    if (answer?.unsafe) return true;
    if (answer?.passed !== false) return false;
    const meta = field?.meta ?? {};
    if (typeof meta.unsafe_on_fail === 'boolean') return meta.unsafe_on_fail;
    return severityRank(answer?.severity ?? meta.severity ?? 'medium') >= severityRank('high');
}

/**
 * A defect at a field that marks the vehicle unsafe, or one the driver
 * marked unsafe, takes the vehicle out of service (E3d).
 */
export function isUnsafe(draft?: InspectionDraft | null, form?: InspectionFormRecord | null): boolean {
    const byId = new Map(fieldsOf(form).map((f) => [f.id, f]));
    for (const [id, a] of Object.entries(draft?.answers ?? {})) {
        if (unsafeOnFail(byId.get(id), a)) return true;
    }
    return false;
}

/** E3b: photo required by the field's rule, else from high severity. */
export function photoRequiredFor(field: InspectionField | undefined, severity: Severity | undefined): boolean {
    const meta = field?.meta ?? {};
    if (typeof meta.require_photo_on_fail === 'boolean') return meta.require_photo_on_fail;
    return severityRank(severity ?? meta.severity ?? 'medium') >= severityRank('high');
}

export function commentRequiredFor(field: InspectionField | undefined): boolean {
    const meta = field?.meta ?? {};
    return typeof meta.require_comment_on_fail === 'boolean' ? meta.require_comment_on_fail : true;
}

export function defectComplete(answer: ItemAnswer, field?: InspectionField): boolean {
    if (answer.passed !== false) return true;
    if (!answer.severity) return false;
    if (commentRequiredFor(field) && !(answer.comments ?? '').trim()) return false;
    if (photoRequiredFor(field, answer.severity) && !answer.photos.length) return false;
    return true;
}

/** The odometer, when the form carries a meter field playing that role. */
export function odometerFieldOf(form?: InspectionFormRecord | null): InspectionField | undefined {
    return fieldsOf(form).find((f) => f.type === 'number' && (f.meta?.role === 'odometer' || String(f.name ?? '').toLowerCase() === 'odometer'));
}

export function signatureFieldOf(form?: InspectionFormRecord | null): InspectionField | undefined {
    return fieldsOf(form).find((f) => f.type === 'signature');
}

/* -- Submission body — the second-cut contract (docs/redesign/11) ---------- */

export interface SubmissionContext {
    driverId: string;
    vehicleId?: string;
    location?: GeoPoint | null;
    signature?: { image?: string; name?: string; signed_at: string } | null;
    now?: () => Date;
}

function valueTypeFor(field: InspectionField): string {
    switch (field.type) {
        case 'pass-fail':
            return 'object';
        case 'number':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'file-upload':
        case 'signature':
            return 'file';
        case 'date-picker':
            return 'date';
        case 'date-time-input':
            return 'datetime';
        default:
            return 'text';
    }
}

/**
 * `custom_field_values` for every answered field, plus the derived
 * `item_results` for pass/fail fields — the server prefers the former and
 * derives the latter itself; sending both keeps a first-cut server working.
 */
export function buildSubmission(form: InspectionFormRecord, draft: InspectionDraft, ctx: SubmissionContext): Record<string, unknown> {
    const now = ctx.now ?? (() => new Date());
    const fields = fieldsOf(form);
    const custom_field_values: Record<string, unknown>[] = [];
    const item_results: Record<string, unknown>[] = [];

    for (const field of fields) {
        if (isPassFail(field)) {
            const a = draft.answers[field.id];
            const passed = a?.passed !== false;
            const na = a?.passed === null;
            const severity = passed ? null : (a?.severity ?? (field.meta?.severity as string | undefined) ?? 'medium');
            const result = {
                item_key: field.name ?? field.id,
                label: field.label,
                category: null as string | null,
                status: na ? 'not_applicable' : passed ? 'passed' : 'failed',
                severity,
                passed,
                comments: a?.comments?.trim() || null,
                photos: a?.photos ?? [],
            };
            item_results.push(result);
            if (a !== undefined) {
                custom_field_values.push({
                    custom_field: field.id,
                    value_type: 'object',
                    value: { passed, not_applicable: na, severity, comments: result.comments, photos: result.photos, unsafe: unsafeOnFail(field, a) },
                });
            }
            continue;
        }
        const v = draft.values?.[field.id];
        if (v === undefined || v === null || v === '') continue;
        custom_field_values.push({ custom_field: field.id, value_type: valueTypeFor(field), value: field.type === 'number' ? Number(v) : v });
    }

    // Category on the derived results: the group the field sits in.
    for (const group of groupsOf(form)) {
        for (const field of group.fields) {
            const r = item_results.find((x) => x.item_key === (field.name ?? field.id));
            if (r) r.category = group.name;
        }
    }

    const meterField = odometerFieldOf(form);
    const meter = meterField ? draft.values?.[meterField.id] : draft.odometer;
    const odometer = meter != null && meter !== '' && Number.isFinite(Number(meter)) ? Math.round(Number(meter)) : null;

    const signatureField = signatureFieldOf(form);
    const signed = signatureField ? draft.values?.[signatureField.id] : undefined;
    const signature = ctx.signature ?? (typeof signed === 'string' && signed ? { image: signed, signed_at: now().toISOString() } : null);

    return {
        inspection_form: form.id,
        driver: ctx.driverId,
        vehicle: ctx.vehicleId ?? draft.vehicleId ?? null,
        odometer,
        engine_hours: null,
        started_at: draft.startedAt,
        custom_field_values,
        item_results,
        location: ctx.location ?? null,
        signature,
        attachments: [],
        meta: {
            source_app: 'navigator',
            client_key: draftKey(form.id, ctx.vehicleId ?? draft.vehicleId),
            unsafe: isUnsafe(draft, form),
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
