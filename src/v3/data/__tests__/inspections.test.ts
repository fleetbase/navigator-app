/**
 * The inspection draft store and the submission body — the body must mirror
 * `PublicInspectionController@submit` field for field, because the driver
 * endpoint shares its validation.
 */
import { InspectionDraftStore, groupItems, groupsOf, fieldsOf, isAnswered, draftProgress, nextUnanswered, isUnsafe, photoRequiredFor, commentRequiredFor, defectComplete, buildSubmission, highestSeverity, odometerFieldOf, signatureFieldOf, type InspectionFormRecord } from '../useInspections';
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

/** A second-cut form: groups of typed fields, as the driver API answers `grouped_fields`. */
const typed: InspectionFormRecord = {
    id: 'inspection_form_2',
    name: 'LGV daily',
    type: 'pre_trip',
    status: 'published',
    is_published: true,
    settings: { create_issue_on_failure: true },
    grouped_fields: [
        {
            id: 'cat_1', name: 'Exterior', order: 1,
            fields: [
                { id: 'cf_mirrors', name: 'mirrors', label: 'Mirrors', type: 'pass-fail', required: true, order: 1, meta: { severity: 'low', require_photo_on_fail: true, require_comment_on_fail: false, unsafe_on_fail: true } },
                { id: 'cf_photo', name: 'body_photo', label: 'Body damage photo', type: 'file-upload', required: true, order: 2 },
            ],
        },
        {
            id: 'cat_2', name: 'Sign-off', order: 2,
            fields: [
                { id: 'cf_odo', name: 'odometer', label: 'Odometer', type: 'number', required: true, order: 1, meta: { unit: 'km', role: 'odometer' } },
                { id: 'cf_fuel', name: 'fuel_level', label: 'Fuel level', type: 'select', required: false, order: 2, options: ['Quarter', 'Half', 'Full'] },
                { id: 'cf_sig', name: 'driver_signature', label: 'Driver signature', type: 'signature', required: true, order: 3 },
            ],
        },
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
    it('groups first-cut items by category into pass-fail fields keyed by item key', () => {
        const draft = { formId: 'f', vehicleId: 'v', startedAt: '', answers: { ext_1: { passed: true, photos: [] } } };
        const groups = groupItems(form, draft);
        expect(groups.map((g) => g.group.name)).toEqual(['Exterior', 'Tyres', 'Interior']);
        expect(groups[0].answered).toBe(1);
        expect(groups[0].group.fields[0]).toMatchObject({ id: 'ext_1', type: 'pass-fail', required: true, meta: { severity: 'medium' } });
        expect(nextUnanswered(form, draft)?.id).toBe('ext_2');
    });

    it('reads a second-cut form as its grouped fields, in order', () => {
        const groups = groupsOf(typed);
        expect(groups.map((g) => g.name)).toEqual(['Exterior', 'Sign-off']);
        expect(fieldsOf(typed).map((f) => f.id)).toEqual(['cf_mirrors', 'cf_photo', 'cf_odo', 'cf_fuel', 'cf_sig']);
    });

    it('is complete once every required field is answered — optional ones may stay blank', () => {
        const draft = {
            formId: 'f', vehicleId: 'v', startedAt: '',
            answers: { ext_1: { passed: true, photos: [] }, ext_2: { passed: null, photos: [] }, tyre_1: { passed: false, severity: 'high' as const, comments: 'gouge', photos: ['abc'] } },
        };
        const p = draftProgress(form, draft);
        expect(p).toMatchObject({ total: 4, answered: 3, passed: 1, defects: 1, notApplicable: 1, complete: true });
        expect(p.missingRequired).toEqual([]);
        expect(highestSeverity(draft)).toBe('high');
    });

    it('counts typed answers too, and treats a boolean false as answered', () => {
        const draft = { formId: 't', startedAt: '', answers: { cf_mirrors: { passed: true, photos: [] } }, values: { cf_odo: 112480, cf_fuel: 'Half', cf_sig: 'QUJD', cf_photo: '' } };
        const p = draftProgress(typed, draft);
        expect(p).toMatchObject({ total: 5, answered: 4, complete: false });
        expect(p.missingRequired.map((f) => f.id)).toEqual(['cf_photo']);
        expect(isAnswered(typed.grouped_fields![0].fields[0], draft)).toBe(true);
        expect(isAnswered({ id: 'b', label: 'b', type: 'boolean' }, { formId: 't', startedAt: '', answers: {}, values: { b: false } })).toBe(true);
    });

    it('marks the vehicle unsafe by the field rule, by high severity when there is none, or when the driver says so', () => {
        const high = { formId: 'f', startedAt: '', answers: { tyre_1: { passed: false, severity: 'high' as const, photos: [] } } };
        const low = { formId: 'f', startedAt: '', answers: { cab_1: { passed: false, severity: 'low' as const, photos: [] } } };
        const said = { formId: 'f', startedAt: '', answers: { cab_1: { passed: false, severity: 'low' as const, photos: [], unsafe: true } } };
        expect(isUnsafe(high, form)).toBe(true);
        expect(isUnsafe(low, form)).toBe(false);
        expect(isUnsafe(said, form)).toBe(true);
        // A field that says unsafe_on_fail is unsafe at any severity; one that says not, never by severity.
        expect(isUnsafe({ formId: 't', startedAt: '', answers: { cf_mirrors: { passed: false, severity: 'low', photos: [] } } }, typed)).toBe(true);
        const gentle = { ...typed, grouped_fields: [{ name: 'g', fields: [{ id: 'x', label: 'x', type: 'pass-fail', meta: { unsafe_on_fail: false } }] }] };
        expect(isUnsafe({ formId: 't', startedAt: '', answers: { x: { passed: false, severity: 'critical', photos: [] } } }, gentle)).toBe(false);
    });

    it('requires a photo and a note by the field rules, falling back to the first cut’s', () => {
        const legacy = fieldsOf(form)[0];
        expect(photoRequiredFor(legacy, 'medium')).toBe(false);
        expect(photoRequiredFor(legacy, 'high')).toBe(true);
        const mirrors = typed.grouped_fields![0].fields[0];
        expect(photoRequiredFor(mirrors, 'low')).toBe(true);
        expect(commentRequiredFor(mirrors)).toBe(false);
        expect(defectComplete({ passed: false, severity: 'medium', comments: '', photos: [] }, legacy)).toBe(false);
        expect(defectComplete({ passed: false, severity: 'medium', comments: 'loose', photos: [] }, legacy)).toBe(true);
        expect(defectComplete({ passed: false, severity: 'high', comments: 'gouge', photos: [] }, legacy)).toBe(false);
        expect(defectComplete({ passed: false, severity: 'low', comments: '', photos: ['x'] }, mirrors)).toBe(true);
    });

    it('finds the odometer and signature fields by role', () => {
        expect(odometerFieldOf(typed)?.id).toBe('cf_odo');
        expect(signatureFieldOf(typed)?.id).toBe('cf_sig');
        expect(odometerFieldOf(form)).toBeUndefined();
    });
});

describe('buildSubmission — the second-cut contract', () => {
    it('sends one custom field value per answered field, typed, plus the derived item results', () => {
        const draft = {
            formId: typed.id, vehicleId: 'vehicle_1', startedAt: '2026-09-09T06:40:00.000Z', certified: true,
            answers: { cf_mirrors: { passed: false, severity: 'low' as const, comments: ' Loose ', photos: ['b64'] } },
            values: { cf_photo: 'UEhPVE8=', cf_odo: 112480, cf_fuel: 'Half', cf_sig: 'U0lH' },
        };
        const body = buildSubmission(typed, draft, { driverId: 'driver_1', vehicleId: 'vehicle_1', location: { type: 'Point', coordinates: [-2.11, 50.68] }, now: at });
        expect(body).toMatchObject({ inspection_form: 'inspection_form_2', driver: 'driver_1', vehicle: 'vehicle_1', odometer: 112480, started_at: '2026-09-09T06:40:00.000Z' });
        const values = body.custom_field_values as Record<string, unknown>[];
        expect(values).toEqual([
            { custom_field: 'cf_mirrors', value_type: 'object', value: { passed: false, not_applicable: false, severity: 'low', comments: 'Loose', photos: ['b64'], unsafe: true } },
            { custom_field: 'cf_photo', value_type: 'file', value: 'UEhPVE8=' },
            { custom_field: 'cf_odo', value_type: 'number', value: 112480 },
            { custom_field: 'cf_fuel', value_type: 'text', value: 'Half' },
            { custom_field: 'cf_sig', value_type: 'file', value: 'U0lH' },
        ]);
        // Derived results carry the group as the category, for a first-cut server.
        const results = body.item_results as Record<string, unknown>[];
        expect(results).toEqual([{ item_key: 'mirrors', label: 'Mirrors', category: 'Exterior', status: 'failed', severity: 'low', passed: false, comments: 'Loose', photos: ['b64'] }]);
        // The signature field stands in for the top-level signature; the meter field for the odometer.
        expect(body.signature).toMatchObject({ image: 'U0lH', signed_at: '2026-09-09T06:48:00.000Z' });
        expect(body.meta).toMatchObject({ source_app: 'navigator', client_key: 'inspection_form_2:vehicle_1', unsafe: true });
        expect(body.location).toEqual({ type: 'Point', coordinates: [-2.11, 50.68] });
    });

    it('still serialises a first-cut form as item results, with values for the answered items', () => {
        const draft = {
            formId: form.id, vehicleId: 'vehicle_1', startedAt: '2026-09-09T06:40:00.000Z', odometer: '112480',
            answers: { ext_1: { passed: true, photos: [] }, ext_2: { passed: null, photos: [] }, tyre_1: { passed: false, severity: 'high' as const, comments: ' Deep gouge ', photos: ['b64'], unsafe: true } },
        };
        const body = buildSubmission(form, draft, { driverId: 'driver_1', vehicleId: 'vehicle_1', now: at });
        expect(body.odometer).toBe(112480);
        const results = body.item_results as Record<string, unknown>[];
        expect(results).toHaveLength(4);
        expect(results[0]).toEqual({ item_key: 'ext_1', label: 'Mirrors', category: 'Exterior', status: 'passed', severity: null, passed: true, comments: null, photos: [] });
        expect(results[1]).toMatchObject({ item_key: 'ext_2', status: 'not_applicable', passed: true });
        expect(results[2]).toEqual({ item_key: 'tyre_1', label: 'Tread depth', category: 'Tyres', status: 'failed', severity: 'high', passed: false, comments: 'Deep gouge', photos: ['b64'] });
        // Unanswered optional item is sent as passed — the form asked nothing of it.
        expect(results[3]).toMatchObject({ item_key: 'cab_1', passed: true });
        expect((body.custom_field_values as unknown[]).length).toBe(3);
    });

    it('sends a null odometer rather than NaN when the field is blank', () => {
        const body = buildSubmission(form, { formId: form.id, startedAt: '', answers: {}, odometer: '' }, { driverId: 'd' });
        expect(body.odometer).toBeNull();
        expect(body.vehicle).toBeNull();
        expect(body.signature).toBeNull();
    });
});
