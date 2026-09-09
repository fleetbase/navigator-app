/**
 * The DVIR flow — R2 E2 gate, E3a checklist, E3b defect capture, E3c review,
 * E3d outcome, E4 history and detail — in all four schemes, with the draft
 * persisted between screens the way it is between launches.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { InspectionScreen } from '../InspectionScreen';
import { InspectionChecklistScreen } from '../InspectionChecklistScreen';
import { InspectionReviewScreen } from '../InspectionReviewScreen';
import { InspectionResultScreen } from '../InspectionResultScreen';
import { InspectionDetailScreen } from '../InspectionDetailScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider, LocationProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { inspectionDrafts, type InspectionFormRecord, type InspectionSubmissionRecord } from '../../data';

jest.mock('../../../components/CameraCapture', () => {
    const React = require('react');
    const { View } = require('react-native');
    return { __esModule: true, default: (props: { onDone?: (p: { base64?: string }[]) => void }) => React.createElement(View, { testID: 'camera-mock', onDone: props.onDone }) };
});
jest.mock('react-native-signature-canvas', () => {
    const React = require('react');
    const { View } = require('react-native');
    return { __esModule: true, default: React.forwardRef((props: Record<string, unknown>, ref: unknown) => React.createElement(View, { testID: 'signature-mock', ...props, ref })) };
});

const form: InspectionFormRecord = {
    id: 'inspection_form_1',
    name: 'LGV daily',
    type: 'pre_trip',
    frequency: 'pre_trip',
    status: 'published',
    is_published: true,
    item_count: 3,
    settings: { create_issue_on_failure: true, create_work_order_on_failure: true },
    items: [
        { key: 'ext_1', label: 'Mirrors', description: 'Both mirrors intact and adjusted.', category: 'Exterior', required: true, severity: 'medium' },
        { key: 'tyre_1', label: 'Sidewall condition — offside rear', category: 'Tyres & wheels', required: true, severity: 'high' },
        { key: 'cab_1', label: 'Horn', category: 'Interior', required: true, severity: 'low' },
    ],
};

const submission: InspectionSubmissionRecord = {
    id: 'inspection_submission_8857',
    type: 'pre_trip',
    status: 'submitted',
    result: 'failed',
    source: 'navigator',
    odometer: 112480,
    total_items: 3,
    failed_items: 1,
    has_failures: true,
    started_at: '2026-09-09T06:48:00Z',
    submitted_at: '2026-09-09T06:52:00Z',
    form_name: 'LGV daily',
    vehicle_name: 'Transit 350',
    vehicle: { id: 'vehicle_2', name: 'Transit 350', plate_number: 'WP71 HLG' },
    item_results: [
        { item_key: 'ext_1', label: 'Mirrors', category: 'Exterior', status: 'passed', passed: true },
        { item_key: 'tyre_1', label: 'Sidewall condition — offside rear', category: 'Tyres & wheels', status: 'failed', severity: 'high', passed: false, comments: 'Deep gouge across the sidewall', photos: ['a', 'b'] },
        { item_key: 'cab_1', label: 'Horn', category: 'Interior', status: 'not_applicable', passed: true },
    ],
    issue: { id: 'issue_1093', status: 'pending', priority: 'high' },
    work_order: { id: 'work_order_3318', status: 'open' },
    meta: { unsafe: true },
};
const passed: InspectionSubmissionRecord = { ...submission, id: 'inspection_submission_8841', result: 'passed', failed_items: 0, has_failures: false, issue: null, work_order: null, meta: {}, type: 'post_trip' };

let fetchMock: jest.Mock;
let queue: MutationQueue;

function mockApi(handlers: Record<string, unknown> = {}) {
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
        const u = String(url);
        const method = init?.method ?? 'GET';
        const key = Object.keys(handlers).find((k) => u.includes(k));
        const body = key ? handlers[key] : u.includes('inspection-forms/') ? form : u.includes('inspection-forms') ? [form] : u.includes('/inspections/') ? submission : u.includes('/inspections') ? [submission, passed] : [];
        if (body === 'fail' || (method !== 'GET' && handlers.__mutations === 'fail')) return Promise.reject(new TypeError('Network request failed'));
        if (body === '404') return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: () => Promise.resolve({ errors: ['Not found'] }) });
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) });
    });
}

beforeEach(() => {
    clearV3();
    inspectionDrafts.clear();
    queue = new MutationQueue();
    fetchMock = jest.fn();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    mockApi();
});

async function mount(node: React.ReactNode, scheme: SchemeName = 'dark', opts: { isOnline?: boolean; location?: unknown } = {}) {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider isOnline={opts.isOnline ?? true}>
                        <LocationProvider location={opts.location}>
                            <FleetbaseProvider host="https://x.test" queue={queue}>
                                {node}
                            </FleetbaseProvider>
                        </LocationProvider>
                    </SyncProvider>
                </Theme>
            </TamaguiProvider>
        );
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    // @ts-expect-error assigned inside act
    return tree;
}

type N = { children?: unknown[]; props?: Record<string, unknown> };
function walk(node: unknown, visit: (n: N) => void): void {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach((c) => walk(c, visit));
    visit(node as N);
    (node as N).children?.forEach((c) => walk(c, visit));
}
const textOf = (t: ReactTestRenderer.ReactTestRenderer) => {
    const out: string[] = [];
    walk(t.toJSON(), (n) => n.children?.forEach((c) => typeof c === 'string' && out.push(c)));
    return out.join(' ');
};
const testIDs = (t: ReactTestRenderer.ReactTestRenderer) => {
    const out: string[] = [];
    walk(t.toJSON(), (n) => typeof n.props?.testID === 'string' && out.push(n.props.testID as string));
    return out;
};
async function press(t: ReactTestRenderer.ReactTestRenderer, testID: string) {
    const node = t.root.findAll((n) => n.props?.testID === testID && typeof n.props?.onPress === 'function')[0];
    if (!node) throw new Error(`no pressable ${testID}`);
    await ReactTestRenderer.act(async () => {
        node.props.onPress();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
}
async function type(t: ReactTestRenderer.ReactTestRenderer, testID: string, text: string) {
    const node = t.root.findAll((n) => n.props?.testID === testID && typeof n.props?.onChangeText === 'function')[0];
    if (!node) throw new Error(`no field ${testID}`);
    await ReactTestRenderer.act(async () => node.props.onChangeText(text));
}
const unmount = (t: ReactTestRenderer.ReactTestRenderer) => ReactTestRenderer.act(() => t.unmount());
const lastMutation = () => {
    const calls = fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET');
    const [url, init] = calls[calls.length - 1] ?? [];
    return { url: String(url ?? ''), method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined };
};
const now = () => new Date('2026-09-09T06:52:00Z');

/* -- Hub (E4 + E2 gate) --------------------------------------------------- */

describe('InspectionScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<InspectionScreen driverId="driver_1" vehicleId="vehicle_2" vehicleName="Transit 350" />, scheme);
        expect(testIDs(t)).toContain('inspection-hub');
        await unmount(t);
    });

    it('lists the checks for the vehicle and the history with identifiers in full', async () => {
        const onStart = jest.fn();
        const t = await mount(<InspectionScreen driverId="driver_1" vehicleId="vehicle_2" vehicleName="Transit 350" onStart={onStart} onOpenSubmission={jest.fn()} />);
        const ids = testIDs(t);
        expect(ids).toContain('inspection-form-inspection_form_1');
        expect(ids).toContain('inspection-row-inspection_submission_8857');
        expect(ids).toContain('inspection-unsafe-inspection_submission_8857');
        const text = textOf(t);
        expect(text).toContain('inspection_submission_8857');
        expect(text).toContain('LGV daily');
        expect(text).toContain('1 DEFECT');
        expect(text).toContain('PASSED');
        await press(t, 'inspection-start-inspection_form_1');
        expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ id: 'inspection_form_1' }), 'vehicle_2');
        await unmount(t);
    });

    it('shows the E2 gate banner after a vehicle swap', async () => {
        const t = await mount(<InspectionScreen driverId="driver_1" vehicleId="vehicle_2" afterSwap />);
        expect(testIDs(t)).toContain('inspection-gate');
        expect(textOf(t)).toContain('pre-trip inspection is required');
        await unmount(t);
    });

    it('filters the history by segment', async () => {
        const t = await mount(<InspectionScreen driverId="driver_1" vehicleId="vehicle_2" />);
        const seg = t.root.findAll((n) => n.props?.testID === 'inspection-segment')[0];
        const defects = seg.findAll((n) => n.props?.accessibilityRole === 'radio' && typeof n.props?.onPress === 'function')[3];
        await ReactTestRenderer.act(async () => defects.props.onPress());
        const ids = testIDs(t);
        expect(ids).toContain('inspection-row-inspection_submission_8857');
        expect(ids).not.toContain('inspection-row-inspection_submission_8841');
        await unmount(t);
    });

    it('reads a 404 on the feature as "not enabled", not as an error', async () => {
        mockApi({ 'inspection-forms': '404', '/inspections': '404' });
        const t = await mount(<InspectionScreen driverId="driver_1" vehicleId="vehicle_2" />);
        const ids = testIDs(t);
        expect(ids).toContain('inspection-not-enabled');
        expect(ids).not.toContain('inspection-forms-error');
        await unmount(t);
    });

    it('says there is nothing to inspect without a vehicle', async () => {
        const t = await mount(<InspectionScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('inspection-no-vehicle');
        await unmount(t);
    });

    it('offers to resume a draft in progress', async () => {
        inspectionDrafts.start('inspection_form_1', 'vehicle_2');
        inspectionDrafts.answer('inspection_form_1', 'vehicle_2', 'ext_1', { passed: true, photos: [] });
        const t = await mount(<InspectionScreen driverId="driver_1" vehicleId="vehicle_2" onStart={jest.fn()} />);
        expect(testIDs(t)).toContain('inspection-draft-inspection_form_1');
        expect(textOf(t)).toContain('In progress · 1 of 3');
        expect(textOf(t)).toContain('Resume');
        await unmount(t);
    });
});

/* -- Checklist (E3a + E3b) ------------------------------------------------ */

describe('InspectionChecklistScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<InspectionChecklistScreen formId="inspection_form_1" vehicleId="vehicle_2" seedForm={form} />, scheme);
        expect(testIDs(t)).toContain('inspection-checklist');
        await unmount(t);
    });

    it('walks the items, writing every answer to the persisted draft as it goes', async () => {
        const t = await mount(<InspectionChecklistScreen formId="inspection_form_1" vehicleId="vehicle_2" seedForm={form} />, 'dark', { isOnline: false });
        expect(textOf(t)).toContain('Offline. Every answer is saved');
        expect(textOf(t)).toContain('ITEM 1 OF 3');
        await press(t, 'checklist-pass');
        expect(inspectionDrafts.get('inspection_form_1', 'vehicle_2')?.answers.ext_1.passed).toBe(true);
        expect(textOf(t)).toContain('ITEM 2 OF 3');
        expect(textOf(t)).toContain('1 / 3');
        await unmount(t);
    });

    it('requires severity, a note, and a photo at high severity before a defect saves', async () => {
        const t = await mount(<InspectionChecklistScreen formId="inspection_form_1" vehicleId="vehicle_2" seedForm={form} />);
        await press(t, 'checklist-item-tyre_1');
        await press(t, 'checklist-defect');
        expect(testIDs(t)).toContain('defect-sheet');
        // The item's default severity is high, so a photo is required.
        expect(textOf(t)).toContain('REQUIRED FOR HIGH AND ABOVE');
        const save = () => t.root.findAll((n) => n.props?.testID === 'defect-save')[0];
        expect(save().props.disabled).toBe(true);
        await type(t, 'defect-notes', 'Deep gouge across the sidewall');
        expect(save().props.disabled).toBe(true);
        // Drop to medium: no photo needed, note present — saveable.
        await press(t, 'defect-severity-medium');
        expect(save().props.disabled).toBe(false);
        await press(t, 'defect-unsafe');
        await press(t, 'defect-save');
        const a = inspectionDrafts.get('inspection_form_1', 'vehicle_2')?.answers.tyre_1;
        expect(a).toMatchObject({ passed: false, severity: 'medium', comments: 'Deep gouge across the sidewall', unsafe: true });
        expect(textOf(t)).toContain('Defect · severity Medium');
        await unmount(t);
    });

    it('takes photos through the camera into the answer', async () => {
        const t = await mount(<InspectionChecklistScreen formId="inspection_form_1" vehicleId="vehicle_2" seedForm={form} />);
        await press(t, 'checklist-item-tyre_1');
        await press(t, 'checklist-defect');
        await press(t, 'defect-add-photo');
        const cam = t.root.findAll((n) => n.props?.testID === 'camera-mock')[0];
        await ReactTestRenderer.act(async () => cam.props.onDone([{ base64: 'AAAA' }, { base64: 'BBBB' }]));
        expect(textOf(t)).toContain('2 photos');
        await unmount(t);
    });

    it('offers review only once every required item is answered, and pauses without losing anything', async () => {
        const onReview = jest.fn();
        const onPause = jest.fn();
        const t = await mount(<InspectionChecklistScreen formId="inspection_form_1" vehicleId="vehicle_2" seedForm={form} onReview={onReview} onPause={onPause} />);
        expect(testIDs(t)).toContain('checklist-next');
        await press(t, 'checklist-pass');
        await press(t, 'checklist-na');
        await press(t, 'checklist-pass');
        expect(testIDs(t)).toContain('checklist-review');
        await press(t, 'checklist-review');
        expect(onReview).toHaveBeenCalledWith('inspection_form_1', 'vehicle_2');
        await press(t, 'checklist-pause');
        expect(onPause).toHaveBeenCalled();
        expect(Object.keys(inspectionDrafts.get('inspection_form_1', 'vehicle_2')?.answers ?? {})).toHaveLength(3);
        await unmount(t);
    });
});

/* -- Review (E3c) --------------------------------------------------------- */

describe('InspectionReviewScreen', () => {
    function completeDraft(withDefect = true) {
        inspectionDrafts.start('inspection_form_1', 'vehicle_2', () => new Date('2026-09-09T06:48:00Z'));
        inspectionDrafts.answer('inspection_form_1', 'vehicle_2', 'ext_1', { passed: true, photos: [] });
        inspectionDrafts.answer('inspection_form_1', 'vehicle_2', 'tyre_1', withDefect ? { passed: false, severity: 'high', comments: 'Deep gouge', photos: ['x'], unsafe: false } : { passed: true, photos: [] });
        inspectionDrafts.answer('inspection_form_1', 'vehicle_2', 'cab_1', { passed: true, photos: [] });
    }

    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        completeDraft();
        const t = await mount(<InspectionReviewScreen formId="inspection_form_1" vehicleId="vehicle_2" driverId="driver_1" seedForm={form} now={now} />, scheme);
        expect(testIDs(t)).toContain('inspection-review');
        await unmount(t);
    });

    it('shows the counts and every defect, and blocks submit until certified', async () => {
        completeDraft();
        const t = await mount(<InspectionReviewScreen formId="inspection_form_1" vehicleId="vehicle_2" driverId="driver_1" driverName="Ronald McDonald" seedForm={form} odometerSeed={112480} now={now} />);
        const text = textOf(t);
        expect(text).toContain('2 of 3 items · 1 defects'.replace('2 of 3', '3 of 3'));
        expect(testIDs(t)).toContain('review-defect-tyre_1');
        expect(text).toContain('HIGH');
        expect(text).toContain('4 m');
        const submit = () => t.root.findAll((n) => n.props?.testID === 'review-submit')[0];
        expect(submit().props.disabled).toBe(true);
        expect(testIDs(t)).toContain('review-needs-certification');
        await press(t, 'review-certify');
        expect(submit().props.disabled).toBe(false);
        await unmount(t);
    });

    it('submits the contract body with the driver, vehicle, odometer, position and signature', async () => {
        completeDraft();
        mockApi({ '/inspections': { submission } });
        const onSubmitted = jest.fn();
        const t = await mount(
            <InspectionReviewScreen formId="inspection_form_1" vehicleId="vehicle_2" driverId="driver_1" driverName="Ronald McDonald" seedForm={form} odometerSeed={112480} onSubmitted={onSubmitted} now={now} />,
            'dark',
            { location: { latitude: 50.685012, longitude: -2.113847 } }
        );
        await press(t, 'review-certify');
        await press(t, 'review-submit');
        const m = lastMutation();
        expect(m.method).toBe('POST');
        expect(m.url).toContain('/v1/inspections');
        expect(m.body).toMatchObject({ inspection_form: 'inspection_form_1', driver: 'driver_1', vehicle: 'vehicle_2', odometer: 112480 });
        expect(m.body.item_results).toHaveLength(3);
        expect(m.body.location.coordinates).toEqual([-2.113847, 50.685012]);
        expect(m.body.signature).toMatchObject({ name: 'Ronald McDonald', signed_at: '2026-09-09T06:52:00.000Z' });
        expect(m.body.meta.unsafe).toBe(true);
        expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ kind: 'sent' }), expect.anything(), true);
        // The draft is done with.
        expect(inspectionDrafts.get('inspection_form_1', 'vehicle_2')).toBeUndefined();
        await unmount(t);
    });

    it('queues offline, keeps a receipt for the history, and clears the draft', async () => {
        completeDraft(false);
        mockApi({ __mutations: 'fail' });
        const onSubmitted = jest.fn();
        const t = await mount(<InspectionReviewScreen formId="inspection_form_1" vehicleId="vehicle_2" driverId="driver_1" seedForm={form} onSubmitted={onSubmitted} now={now} />, 'dark', { isOnline: false });
        expect(textOf(t)).toContain('Stored on device now');
        await press(t, 'review-certify');
        await press(t, 'review-submit');
        expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ kind: 'queued' }), expect.anything(), false);
        expect(queue.snapshot().items.length).toBe(1);
        expect(inspectionDrafts.pendingReceipts()).toHaveLength(1);
        expect(inspectionDrafts.pendingReceipts()[0]).toMatchObject({ queued: true, result: 'passed', total_items: 3 });
        expect(inspectionDrafts.get('inspection_form_1', 'vehicle_2')).toBeUndefined();
        await unmount(t);
    });

    it('asks for a signature when the form requires one', async () => {
        completeDraft(false);
        const strict = { ...form, settings: { require_signature: true } };
        mockApi({ 'inspection-forms/': strict });
        const t = await mount(<InspectionReviewScreen formId="inspection_form_1" vehicleId="vehicle_2" driverId="driver_1" seedForm={strict} now={now} />);
        await press(t, 'review-certify');
        expect(testIDs(t)).toContain('review-needs-signature');
        const submit = () => t.root.findAll((n) => n.props?.testID === 'review-submit')[0];
        expect(submit().props.disabled).toBe(true);
        await press(t, 'review-sign');
        const pad = t.root.findAll((n) => n.props?.testID === 'signature-mock')[0];
        await ReactTestRenderer.act(async () => pad.props.onOK('data:image/png;base64,SIG=='));
        expect(textOf(t)).toContain('Signed');
        expect(submit().props.disabled).toBe(false);
        await unmount(t);
    });
});

/* -- Result (E3d) and detail (E4/E5) --------------------------------------- */

describe('InspectionResultScreen', () => {
    it.each(SCHEMES)('renders the unsafe outcome in the %s scheme', async (scheme) => {
        const t = await mount(<InspectionResultScreen submission={submission} vehicleName="Transit 350" unsafe />, scheme);
        expect(testIDs(t)).toContain('inspection-result-unsafe');
        await unmount(t);
    });

    it('names the vehicle out of service with every record identifier in full and the three next steps', async () => {
        const onChooseVehicle = jest.fn();
        const t = await mount(<InspectionResultScreen submission={submission} vehicleName="Transit 350" unsafe onChooseVehicle={onChooseVehicle} onMessageDispatch={jest.fn()} onDone={jest.fn()} />);
        const text = textOf(t);
        expect(text).toContain('Transit 350 is out of service');
        expect(text).toContain('inspection_submission_8857');
        expect(text).toContain('issue_1093');
        expect(text).toContain('work_order_3318');
        expect(testIDs(t)).toContain('result-what-now');
        await press(t, 'result-choose-vehicle');
        expect(onChooseVehicle).toHaveBeenCalled();
        await unmount(t);
    });

    it('is calm for a pass and honest about a queued receipt', async () => {
        const t = await mount(<InspectionResultScreen submission={{ ...passed, id: 'queued:1', queued: true }} unsafe={false} onDone={jest.fn()} />);
        expect(testIDs(t)).toContain('inspection-result-passed');
        expect(testIDs(t)).toContain('result-queued');
        expect(textOf(t)).not.toContain('queued:1');
        await unmount(t);
    });
});

describe('InspectionDetailScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<InspectionDetailScreen submissionId="inspection_submission_8857" seed={submission} />, scheme);
        expect(testIDs(t)).toContain('inspection-detail');
        await unmount(t);
    });

    it('puts defects first, with severity, note and photo count, and the linked records', async () => {
        const t = await mount(<InspectionDetailScreen submissionId="inspection_submission_8857" seed={submission} />);
        const ids = testIDs(t);
        expect(ids).toContain('inspection-detail-defects');
        expect(ids).toContain('inspection-detail-issue');
        expect(ids).toContain('inspection-detail-work-order');
        expect(ids).toContain('inspection-detail-unsafe');
        const text = textOf(t);
        expect(text).toContain('Deep gouge across the sidewall');
        expect(text).toContain('2 photos');
        expect(text).toContain('112,480 km');
        expect(text).toContain('WP71 HLG');
        await unmount(t);
    });
});
