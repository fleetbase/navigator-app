/**
 * The Route tab — RouteScreen, StopDetailScreen, StopExecutionScreen,
 * OptimisePreviewScreen — against a fixture shaped like the v0.6.65 manifest
 * resources, every screen in all four schemes.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { RouteScreen } from '../RouteScreen';
import { StopDetailScreen } from '../StopDetailScreen';
import { StopExecutionScreen } from '../StopExecutionScreen';
import { OptimisePreviewScreen } from '../OptimisePreviewScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider, LocationProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';
import { manifestStore, orderStore, nearestFirst } from '../../data';
import { dayKey } from '../../data/orderStore';

const place = (name: string, lat: number, lon: number, extra: Record<string, unknown> = {}) => ({
    id: `place_${name}`,
    name,
    address: `${name} Road, Swanage BH19 1ES`,
    location: { type: 'Point', coordinates: [lon, lat] },
    ...extra,
});

const stops = [
    { id: 'mstop_1', status: 'completed', sequence: 1, actual_arrival: '2026-08-19T12:41:00Z', place: place('Wareham Depot', 50.687, -2.11) },
    {
        id: 'mstop_2',
        status: 'pending',
        sequence: 2,
        estimated_arrival: '2026-08-19T13:32:00Z',
        distance_from_prev_m: 2400,
        duration_from_prev_s: 420,
        place: place('Harbour View Pharmacy', 50.6085, -1.9598, { phone: '+441929422118', security_access_code: '4471', building: 'Rear yard' }),
        order: { id: 'order_1', tracking_number: 'FLE0636178718SG', status: 'driver_enroute' },
    },
    { id: 'mstop_3', status: 'pending', sequence: 3, estimated_arrival: '2026-08-19T13:58:00Z', distance_from_prev_m: 6800, place: place('Corfe Castle Post Office', 50.640152, -2.057361) },
    { id: 'mstop_4', status: 'pending', sequence: 4, estimated_arrival: '2026-08-19T14:52:00Z', distance_from_prev_m: 5500, place: place('Langton Matravers Stores', 50.6, -2.01) },
    { id: 'mstop_5', status: 'pending', sequence: 5, estimated_arrival: '2026-08-19T15:15:00Z', distance_from_prev_m: 4100, place: place('Kingston Farm Shop', 50.62, -2.07) },
];

const manifest = (over: Record<string, unknown> = {}) => ({
    id: 'manifest_4471',
    status: 'in_progress',
    scheduled_date: `${dayKey()}T00:00:00.000000Z`,
    started_at: '2026-08-19T06:40:00Z',
    total_distance_m: 52600,
    total_duration_s: 11520,
    stop_count: 5,
    completed_stops: 1,
    pending_stops: 4,
    vehicle_name: 'Sprinter 316',
    notes: 'Purbeck loop',
    ...over,
});

const detail = (over: Record<string, unknown> = {}) => ({ ...manifest(), stops, ...over });

let fetchMock: jest.Mock;
let queue: MutationQueue;

function mockApi(handlers: Record<string, unknown> = {}) {
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
        const u = String(url);
        const method = init?.method ?? 'GET';
        const key = Object.keys(handlers).find((k) => u.includes(k));
        const body = key ? handlers[key] : u.includes('/manifests/') ? detail() : u.includes('/manifests') ? [manifest()] : [];
        if (body === 'fail' || (method !== 'GET' && handlers.__mutations === 'fail')) {
            return Promise.reject(new TypeError('Network request failed'));
        }
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) });
    });
}

beforeEach(() => {
    clearV3();
    settingsStore.reset();
    manifestStore.clear();
    orderStore.clear();
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
const unmount = (t: ReactTestRenderer.ReactTestRenderer) => ReactTestRenderer.act(() => t.unmount());
const lastMutation = () => {
    const calls = fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET');
    const [url, init] = calls[calls.length - 1] ?? [];
    return { url: String(url ?? ''), method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined };
};

/* -- RouteScreen ---------------------------------------------------------- */

describe('RouteScreen', () => {
    it.each(SCHEMES)('renders the route in the %s scheme', async (scheme) => {
        const t = await mount(<RouteScreen driverId="driver_1" />, scheme);
        expect(testIDs(t)).toContain('route-header');
        await unmount(t);
    });

    it("opens straight into today's only manifest, with the id and every tracking number in full", async () => {
        const t = await mount(<RouteScreen driverId="driver_1" />);
        const text = textOf(t);
        expect(text).toContain('manifest_4471');
        expect(text).toContain('FLE0636178718SG');
        expect(text).not.toContain('…');
        // Completed stops are collapsed behind a count; pending ones are listed.
        const ids = testIDs(t);
        expect(ids).toContain('route-completed-toggle');
        expect(ids).not.toContain('route-stop-mstop_1');
        expect(ids).toContain('route-stop-mstop_2');
        expect(text).toContain('4 stops left');
        await unmount(t);
    });

    it('shows the completed stops on request', async () => {
        const t = await mount(<RouteScreen driverId="driver_1" />);
        await press(t, 'route-completed-toggle');
        expect(testIDs(t)).toContain('route-stop-mstop_1');
        await unmount(t);
    });

    it('offers navigate to the current stop and optimise for three or more remaining', async () => {
        const onNavigate = jest.fn();
        const onOptimise = jest.fn();
        const t = await mount(<RouteScreen driverId="driver_1" onNavigate={onNavigate} onOptimise={onOptimise} />);
        await press(t, 'route-navigate');
        expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ latitude: 50.6085, longitude: -1.9598, label: 'Harbour View Pharmacy' }));
        await press(t, 'route-optimise');
        expect(onOptimise).toHaveBeenCalledWith('manifest_4471');
        await unmount(t);
    });

    it('does not offer optimise with fewer than three stops to do', async () => {
        mockApi({ '/manifests/': detail({ stops: stops.slice(0, 3) }) });
        const t = await mount(<RouteScreen driverId="driver_1" onOptimise={jest.fn()} />);
        expect(testIDs(t)).not.toContain('route-optimise');
        await unmount(t);
    });

    it('switches to the map with the stops placed and a next-stop card', async () => {
        const t = await mount(<RouteScreen driverId="driver_1" onNavigate={jest.fn()} />);
        const toggle = t.root.findAll((n) => n.props?.testID === 'route-view')[0];
        const mapOption = toggle.findAll((n) => n.props?.accessibilityRole === 'radio' && typeof n.props?.onPress === 'function')[1];
        await ReactTestRenderer.act(async () => {
            mapOption.props.onPress();
        });
        const ids = testIDs(t);
        expect(ids).toContain('route-map');
        expect(ids).toContain('route-marker-mstop_2');
        expect(ids).toContain('route-next-stop');
        expect(textOf(t)).toContain('Harbour View Pharmacy');
        await unmount(t);
    });

    it('lists manifests as cards when there is more than one today', async () => {
        mockApi({ '/manifests?': [manifest(), manifest({ id: 'manifest_4483', vehicle_name: null, status: 'active' })] });
        const t = await mount(<RouteScreen driverId="driver_1" />);
        const ids = testIDs(t);
        expect(ids).toContain('manifest-manifest_4471');
        expect(ids).toContain('manifest-manifest_4483');
        expect(textOf(t)).toContain('Vehicle not yet assigned');
        await press(t, 'manifest-manifest_4483');
        expect(testIDs(t)).toContain('route-header');
        await unmount(t);
    });

    it('shows an honest empty state per segment', async () => {
        mockApi({ '/manifests?': [] });
        const t = await mount(<RouteScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('route-empty-today');
        expect(textOf(t)).toContain('No route today');
        await unmount(t);
    });

    it('surfaces a retryable failure when the list cannot be read', async () => {
        mockApi({ '/manifests?': 'fail' });
        const t = await mount(<RouteScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('route-manifests-error');
        await unmount(t);
    });

    it('still shows the cached route offline', async () => {
        manifestStore.upsert(detail() as never);
        mockApi({ '/manifests?': 'fail', '/manifests/': 'fail' });
        const t = await mount(<RouteScreen driverId="driver_1" />, 'dark', { isOnline: false });
        expect(testIDs(t)).toContain('route-stop-mstop_2');
        await unmount(t);
    });
});

/* -- StopDetailScreen ----------------------------------------------------- */

describe('StopDetailScreen', () => {
    const inRange = { latitude: 50.6086, longitude: -1.9599 };
    const farAway = { latitude: 50.643118, longitude: -2.061902 };

    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<StopDetailScreen manifestId="manifest_4471" stopId="mstop_2" />, scheme);
        expect(testIDs(t)).toContain('stop-detail');
        await unmount(t);
    });

    it('shows the coordinates, the tracking number and the entry details in full', async () => {
        mockApi({ '/orders/order_1': { id: 'order_1', status: 'driver_enroute', pod_required: true, payload: { entities: [{ id: 'ent_1', name: 'Rx cold-chain box', tracking_number: 'ENT-000004471-A' }] } } });
        const t = await mount(<StopDetailScreen manifestId="manifest_4471" stopId="mstop_2" onOpenOrder={jest.fn()} />);
        const text = textOf(t);
        expect(text).toContain('50.608500, -1.959800');
        expect(text).toContain('FLE0636178718SG');
        expect(text).toContain('ENT-000004471-A');
        expect(text).toContain('Access code 4471');
        expect(text).toContain('+441929422118');
        expect(testIDs(t)).toContain('stop-proof-required');
        await unmount(t);
    });

    it('arrives directly when inside the geofence, recording the position', async () => {
        mockApi({ 'manifest-stops/mstop_2': { ...stops[1], status: 'arrived', actual_arrival: '2026-08-19T13:31:00Z' } });
        const t = await mount(<StopDetailScreen manifestId="manifest_4471" stopId="mstop_2" />, 'dark', { location: inRange });
        await press(t, 'stop-arrive');
        const m = lastMutation();
        expect(m.url).toContain('manifest-stops/mstop_2');
        expect(m.body.status).toBe('arrived');
        expect(m.body.meta.arrival_check).toBe('in-range');
        expect(m.body.meta.arrival_position.coordinates).toEqual([inRange.longitude, inRange.latitude]);
        expect(testIDs(t)).toContain('stop-notice-success');
        // The action bar has moved on to completion.
        expect(testIDs(t)).toContain('stop-complete');
        await unmount(t);
    });

    it('asks first when outside the geofence, and records the distance if confirmed', async () => {
        const t = await mount(<StopDetailScreen manifestId="manifest_4471" stopId="mstop_2" />, 'dark', { location: farAway });
        await press(t, 'stop-arrive');
        expect(testIDs(t)).toContain('stop-geofence-out-of-range');
        expect(textOf(t)).toMatch(/You're \d+(\.\d+)? (km|m) from stop 2/);
        expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'PATCH')).toHaveLength(0);
        await press(t, 'stop-arrive-anyway');
        const m = lastMutation();
        expect(m.body.meta.arrival_check).toBe('out-of-range');
        expect(m.body.meta.arrival_distance_m).toBeGreaterThan(120);
        await unmount(t);
    });

    it('lets the driver keep driving instead', async () => {
        const t = await mount(<StopDetailScreen manifestId="manifest_4471" stopId="mstop_2" />, 'dark', { location: farAway });
        await press(t, 'stop-arrive');
        await press(t, 'stop-keep-driving');
        expect(testIDs(t)).not.toContain('stop-geofence-out-of-range');
        await unmount(t);
    });

    it('marks the arrival position unknown when there is no fix', async () => {
        const t = await mount(<StopDetailScreen manifestId="manifest_4471" stopId="mstop_2" />);
        await press(t, 'stop-arrive');
        expect(testIDs(t)).toContain('stop-geofence-no-position');
        await press(t, 'stop-arrive-no-position');
        expect(lastMutation().body.meta.arrival_check).toBe('no-position');
        await unmount(t);
    });

    it('queues the arrival offline and reflects it locally', async () => {
        mockApi({ __mutations: 'fail' });
        const t = await mount(<StopDetailScreen manifestId="manifest_4471" stopId="mstop_2" />, 'dark', { isOnline: false, location: inRange });
        await press(t, 'stop-arrive');
        expect(testIDs(t)).toContain('stop-notice-neutral');
        expect(textOf(t)).toContain('saved on this device');
        expect(queue.snapshot().items.length).toBe(1);
        expect(manifestStore.stop('manifest_4471', 'mstop_2')?.status).toBe('arrived');
        await unmount(t);
    });

    it('skips with a reason, after confirming', async () => {
        const t = await mount(<StopDetailScreen manifestId="manifest_4471" stopId="mstop_2" />);
        await press(t, 'stop-skip');
        expect(testIDs(t)).toContain('stop-skip-confirm');
        const field = t.root.findAll((n) => n.props?.testID === 'stop-skip-reason' && typeof n.props?.onChangeText === 'function')[0];
        await ReactTestRenderer.act(async () => {
            field.props.onChangeText('Closed early');
        });
        await press(t, 'stop-skip-send');
        const m = lastMutation();
        expect(m.body.status).toBe('skipped');
        expect(m.body.meta.skip_reason).toBe('Closed early');
        await unmount(t);
    });

    it('reads a completed stop without offering actions', async () => {
        const t = await mount(<StopDetailScreen manifestId="manifest_4471" stopId="mstop_1" />);
        const ids = testIDs(t);
        expect(ids).toContain('stop-done');
        expect(ids).not.toContain('stop-actions');
        expect(ids).toContain('stop-no-order');
        await unmount(t);
    });
});

/* -- StopExecutionScreen -------------------------------------------------- */

describe('StopExecutionScreen', () => {
    const arrived = () => detail({ stops: stops.map((s) => (s.id === 'mstop_2' ? { ...s, status: 'arrived' } : s)) });
    const now = () => new Date('2026-08-19T13:38:04Z');

    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        mockApi({ '/manifests/': arrived() });
        const t = await mount(<StopExecutionScreen manifestId="manifest_4471" stopId="mstop_2" now={now} />, scheme);
        expect(testIDs(t)).toContain('stop-execution');
        await unmount(t);
    });

    it('blocks completion while the order requires proof and is unfinished', async () => {
        mockApi({ '/manifests/': arrived(), '/orders/order_1': { id: 'order_1', status: 'driver_enroute', pod_required: true } });
        const onOpenOrder = jest.fn();
        const t = await mount(<StopExecutionScreen manifestId="manifest_4471" stopId="mstop_2" onOpenOrder={onOpenOrder} now={now} />);
        expect(testIDs(t)).toContain('execution-blocked');
        expect(textOf(t)).toContain('Complete stop · blocked');
        const button = t.root.findAll((n) => n.props?.testID === 'execution-complete')[0];
        expect(button.props.disabled).toBe(true);
        await press(t, 'execution-open-order');
        expect(onOpenOrder).toHaveBeenCalledWith('order_1');
        await unmount(t);
    });

    it('completes once the order is done, recording GPS and time, then hands off to the next stop', async () => {
        mockApi({
            '/manifests/': arrived(),
            '/orders/order_1': { id: 'order_1', status: 'completed', pod_required: true },
            'manifest-stops/mstop_2': { ...stops[1], status: 'completed' },
        });
        const onNavigate = jest.fn();
        const t = await mount(<StopExecutionScreen manifestId="manifest_4471" stopId="mstop_2" onNavigate={onNavigate} now={now} />, 'dark', {
            location: { latitude: 50.608812, longitude: -1.95914 },
        });
        expect(testIDs(t)).not.toContain('execution-blocked');
        expect(textOf(t)).toContain('50.608812, -1.959140');
        await press(t, 'execution-complete');
        const m = lastMutation();
        expect(m.body.status).toBe('completed');
        expect(m.body.meta.completion_position.coordinates).toEqual([-1.95914, 50.608812]);
        expect(testIDs(t)).toContain('execution-done');
        expect(textOf(t)).toContain('Next: stop 3 · Corfe Castle Post Office');
        await press(t, 'execution-navigate-next');
        expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ latitude: 50.640152, label: 'Corfe Castle Post Office' }));
        await unmount(t);
    });

    it('is not gated for a stop with no order', async () => {
        const noOrder = detail({ stops: stops.map((s) => (s.id === 'mstop_3' ? { ...s, status: 'arrived' } : s)) });
        mockApi({ '/manifests/': noOrder });
        const t = await mount(<StopExecutionScreen manifestId="manifest_4471" stopId="mstop_3" now={now} />);
        expect(testIDs(t)).toContain('execution-no-order');
        expect(testIDs(t)).not.toContain('execution-blocked');
        await unmount(t);
    });

    it('queues the completion offline and says so', async () => {
        manifestStore.upsert(arrived() as never);
        mockApi({ '/manifests/': 'fail', '/orders/order_1': 'fail', __mutations: 'fail' });
        const t = await mount(<StopExecutionScreen manifestId="manifest_4471" stopId="mstop_2" now={now} />, 'dark', { isOnline: false });
        await press(t, 'execution-complete');
        expect(testIDs(t)).toContain('execution-queued');
        expect(queue.snapshot().items.length).toBe(1);
        await unmount(t);
    });
});

/* -- OptimisePreviewScreen ------------------------------------------------ */

describe('OptimisePreviewScreen', () => {
    // From here the listed order (2 → 3 → 4 → 5) is not nearest-first.
    const driver = { latitude: 50.6, longitude: -2.0 };

    it.each(SCHEMES)('renders the preview in the %s scheme', async (scheme) => {
        const t = await mount(<OptimisePreviewScreen manifestId="manifest_4471" />, scheme, { location: driver });
        expect(testIDs(t)).toContain('optimise-preview');
        await unmount(t);
    });

    it('shows before and after, with the moved stops and the deltas', async () => {
        const t = await mount(<OptimisePreviewScreen manifestId="manifest_4471" />, 'dark', { location: driver });
        const ids = testIDs(t);
        expect(ids).toContain('optimise-before');
        expect(ids).toContain('optimise-after');
        expect(ids).toContain('optimise-distance');
        expect(ids).toContain('optimise-time');
        expect(textOf(t)).toContain('4 remaining stops');
        await unmount(t);
    });

    it('applies through the server with the position, and closes on its answer', async () => {
        const reordered = detail({ stops: stops.map((s, i) => ({ ...s, sequence: i + 1 })) });
        mockApi({ '/optimize': reordered });
        const onDone = jest.fn();
        const t = await mount(<OptimisePreviewScreen manifestId="manifest_4471" onDone={onDone} />, 'dark', { location: driver });
        await press(t, 'optimise-apply');
        const m = lastMutation();
        expect(m.url).toContain('/manifests/manifest_4471/optimize');
        expect(m.method).toBe('POST');
        expect(m.body).toEqual({ latitude: 50.6, longitude: -2.0 });
        expect(onDone).toHaveBeenCalled();
        await unmount(t);
    });

    it('never queues an optimise — it fails honestly instead', async () => {
        mockApi({ __mutations: 'fail' });
        const t = await mount(<OptimisePreviewScreen manifestId="manifest_4471" />, 'dark', { location: driver });
        await press(t, 'optimise-apply');
        expect(testIDs(t)).toContain('optimise-failed');
        expect(queue.snapshot().items.length).toBe(0);
        await unmount(t);
    });

    it('is calm offline, with too few stops, and when nothing would change', async () => {
        const offline = await mount(<OptimisePreviewScreen manifestId="manifest_4471" />, 'dark', { isOnline: false, location: driver });
        expect(testIDs(offline)).toContain('optimise-offline');
        await unmount(offline);

        mockApi({ '/manifests/': detail({ stops: stops.slice(0, 3) }) });
        const few = await mount(<OptimisePreviewScreen manifestId="manifest_4471" />, 'dark', { location: driver });
        expect(testIDs(few)).toContain('optimise-too-few');
        await unmount(few);

        // Listed nearest-first from the driver already.
        const ordered = detail({ stops: nearestFirst(stops as never, driver) });
        mockApi({ '/manifests/': ordered });
        const same = await mount(<OptimisePreviewScreen manifestId="manifest_4471" />, 'dark', { location: driver });
        expect(testIDs(same)).toContain('optimise-unchanged');
        await unmount(same);
    });
});
