/**
 * The inspection draft store and the submission body — the body must mirror
 * `PublicInspectionController@submit` field for field, because the driver
 * endpoint shares its validation.
 */
import { InspectionDraftStore, groupItems, draftProgress, nextUnanswered, isUnsafe, photoRequiredFor, defectComplete, buildSubmission, highestSeverity, type InspectionFormRecord } from '../useInspections';
import { clearV3 } from '../../api/storage';

const form: InspectionFormRecord = {
    id: 'inspection_form_1',
    name: 'LGV daily',
    type: 'pre_trip',
    status: 'published',
    is_published: true,
    settings: { create_issue_on_failure: true, require_signature: false },
    items: [
        { key: 'ext_1', label: 'Mirrors', category: 'Exterior', required: true, severity: 'medium' },
        { key: 'ext_2', label: 'Lights', category: 'Exterior', required: true, severity: 'high' },
        { key: 'tyre_1', label: 'Tread depth', category: 'Tyres', required: true, severity: 'high' },
        { key: 'cab_1', label: 'Horn', category: 'Interior', required: false, severity: 'low' },
    ],
};

const fresh = () => new InspectionDraftStore({ byKey: {}, pending: [], version: 0 });
const at = () => new Date('2026-09-09T06:48:00Z');

beforeEach(() => clearV3());

describe('InspectionDraftStore', () => {
    it('creates a draft on first start and keeps it across reads', () => {
        const s = fresh();
        const d = s.start('f', 'v', at);
        expect(d.startedAt).toBe('2026-09-09T06:48:00.000Z');
        expect(s.start('f', 'v')).toBe(d);
    });

    it('records answers and patches, and notifies', () => {
        const s = fresh();
        const seen = jest.fn();
        s.subscribe(seen);
        s.answer('f', 'v', 'ext_1', { passed: true, photos: [] });
        s.patch('f', 'v', { odometer: '112480', certified: true });
        expect(s.get('f', 'v')?.answers.ext_1.passed).toBe(true);
        expect(s.get('f', 'v')?.odometer).toBe('112480');
        expect(seen).toHaveBeenCalled();
        s.discard('f', 'v');
        expect(s.get('f', 'v')).toBeUndefined();
    });

    it('keeps queued receipts until the server lists them', () => {
        const s = fresh();
        s.addPending({ id: 'queued:1', queued: true, meta: { client_key: 'f:v' } });
        expect(s.pendingReceipts()).toHaveLength(1);
        s.reconcilePending([{ id: 'inspection_submission_9', meta: { client_key: 'other' } }]);
        expect(s.pendingReceipts()).toHaveLength(1);
        s.reconcilePending([{ id: 'inspection_submission_9', meta: { client_key: 'f:v' } }]);
        expect(s.pendingReceipts()).toHaveLength(0);
    });
});

describe('checklist derivations', () => {
    it('groups by area in form order and counts answers', () => {
        const draft = { formId: 'f', vehicleId: 'v', startedAt: '', answers: { ext_1: { passed: true, photos: [] } } };
        const groups = groupItems(form, draft);
        expect(groups.map((g) => g.category)).toEqual(['Exterior', 'Tyres', 'Interior']);
        expect(groups[0].answered).toBe(1);
        expect(nextUnanswered(form, draft)?.key).toBe('ext_2');
    });

    it('is complete once every required item is answered — optional ones may stay blank', () => {
        const draft = {
            formId: 'f', vehicleId: 'v', startedAt: '',
            answers: { ext_1: { passed: true, photos: [] }, ext_2: { passed: null, photos: [] }, tyre_1: { passed: false, severity: 'high' as const, comments: 'gouge', photos: ['abc'] } },
        };
        const p = draftProgress(form, draft);
        expect(p).toMatchObject({ total: 4, answered: 3, passed: 1, defects: 1, notApplicable: 1, complete: true });
        expect(p.missingRequired).toEqual([]);
        expect(highestSeverity(draft)).toBe('high');
    });

    it('marks the vehicle unsafe at high severity or when the driver says so', () => {
        const high = { formId: 'f', startedAt: '', answers: { tyre_1: { passed: false, severity: 'high' as const, photos: [] } } };
        const low = { formId: 'f', startedAt: '', answers: { cab_1: { passed: false, severity: 'low' as const, photos: [] } } };
        const said = { formId: 'f', startedAt: '', answers: { cab_1: { passed: false, severity: 'low' as const, photos: [], unsafe: true } } };
        expect(isUnsafe(high)).toBe(true);
        expect(isUnsafe(low)).toBe(false);
        expect(isUnsafe(said)).toBe(true);
    });

    it('requires a photo from high severity, and always a note', () => {
        expect(photoRequiredFor('medium')).toBe(false);
        expect(photoRequiredFor('high')).toBe(true);
        expect(photoRequiredFor('medium', { photo_required_from: 'medium' })).toBe(true);
        expect(defectComplete({ passed: false, severity: 'medium', comments: '', photos: [] })).toBe(false);
        expect(defectComplete({ passed: false, severity: 'medium', comments: 'loose', photos: [] })).toBe(true);
        expect(defectComplete({ passed: false, severity: 'high', comments: 'gouge', photos: [] })).toBe(false);
        expect(defectComplete({ passed: false, severity: 'high', comments: 'gouge', photos: ['x'] })).toBe(true);
    });
});

describe('buildSubmission — mirrors the public submit contract', () => {
    it('sends one result per form item with the contract fields, and the identifiers', () => {
        const draft = {
            formId: form.id, vehicleId: 'vehicle_1', startedAt: '2026-09-09T06:40:00.000Z', odometer: '112480', certified: true,
            answers: {
                ext_1: { passed: true, photos: [] },
                ext_2: { passed: null, photos: [] },
                tyre_1: { passed: false, severity: 'high' as const, comments: ' Deep gouge ', photos: ['b64'], unsafe: true },
            },
        };
        const body = buildSubmission(form, draft, { driverId: 'driver_1', vehicleId: 'vehicle_1', location: { type: 'Point', coordinates: [-2.11, 50.68] }, now: at });
        expect(body).toMatchObject({ inspection_form: 'inspection_form_1', driver: 'driver_1', vehicle: 'vehicle_1', odometer: 112480, started_at: '2026-09-09T06:40:00.000Z' });
        const results = body.item_results as Record<string, unknown>[];
        expect(results).toHaveLength(4);
        expect(results[0]).toEqual({ item_key: 'ext_1', label: 'Mirrors', category: 'Exterior', status: 'passed', severity: null, passed: true, comments: null, photos: [] });
        expect(results[1]).toMatchObject({ item_key: 'ext_2', status: 'not_applicable', passed: true });
        expect(results[2]).toEqual({ item_key: 'tyre_1', label: 'Tread depth', category: 'Tyres', status: 'failed', severity: 'high', passed: false, comments: 'Deep gouge', photos: ['b64'] });
        // Unanswered optional item is sent as passed — the form asked nothing of it.
        expect(results[3]).toMatchObject({ item_key: 'cab_1', passed: true });
        expect(body.meta).toMatchObject({ source_app: 'navigator', client_key: 'inspection_form_1:vehicle_1', unsafe: true });
        expect(body.location).toEqual({ type: 'Point', coordinates: [-2.11, 50.68] });
    });

    it('sends a null odometer rather than NaN when the field is blank', () => {
        const body = buildSubmission(form, { formId: form.id, startedAt: '', answers: {}, odometer: '' }, { driverId: 'd' });
        expect(body.odometer).toBeNull();
        expect(body.vehicle).toBeNull();
    });
});
