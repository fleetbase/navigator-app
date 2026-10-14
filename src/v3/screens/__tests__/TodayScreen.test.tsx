import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { TodayScreen } from '../TodayScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';
import { orderStore } from '../../data';

const order = {
    id: 'order_1',
    status: 'dispatched',
    tracking_number: { id: 'track_1', tracking_number: 'FLE4253599245SG' },
    payload: { dropoff: { name: '100 Beach Road' } },
};

const dispatchedTracker = {
    lifecycle: { status: 'dispatched', has_started: false, show_live_eta: false, show_start_eta: true },
    eta: { start_seconds: 1956, start_at: '2026-08-22T05:03:56.805032Z', active_stop_seconds: null },
    insights: { is_delayed: false, is_location_stale: true, is_off_route: false },
    progress: { percentage: 0, completed_stops: 0, remaining_stops: 2, total_stops: 2, remaining_distance_m: 48937 },
    active_stop: { uuid: 'a', type: 'pickup', completed: false, address: '18 Loyang Crescent', sequence: 1, latitude: 1.38, longitude: 103.97 },
};

let fetchMock: jest.Mock;
let queue: MutationQueue;

function mockApi(orders: unknown = [order], tracker: unknown = dispatchedTracker) {
    fetchMock.mockImplementation((url: string) => {
        const u = String(url);
        const body = u.includes('/tracker') ? tracker : orders;
        if (body === 'fail') return Promise.reject(new TypeError('Network request failed'));
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) });
    });
}

beforeEach(() => {
    clearV3();
    settingsStore.reset();
    orderStore.clear();
    queue = new MutationQueue();
    fetchMock = jest.fn();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    mockApi();
});

async function mount(node: React.ReactNode, scheme: SchemeName = 'dark') {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider>
                        <FleetbaseProvider host="https://x.test" queue={queue}>
                            {node}
                        </FleetbaseProvider>
                    </SyncProvider>
                </Theme>
            </TamaguiProvider>
        );
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

describe('TodayScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<TodayScreen driverId="driver_1" />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('names the four cards it cannot show, rather than omitting them quietly', async () => {
        // A driver should see the app knows these exist and are switched off.
        const t = await mount(<TodayScreen driverId="driver_1" />);
        const ids = testIDs(t);
        for (const key of ['hos', 'driveTime', 'break', 'inspection']) {
            expect(ids).toContain(`not-enabled-${key}`);
        }
        expect(textOf(t)).toContain('Not enabled');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows an estimated start, not an arrival, for a job not yet begun', async () => {
        const t = await mount(<TodayScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('today-eta-start');
        expect(textOf(t)).toContain('Starting in');
        expect(textOf(t)).not.toContain('Arriving in');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('labels an ETA computed from a stale position', async () => {
        // The live instance answered with a position ~12 hours old.
        const t = await mount(<TodayScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('today-stale-location');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('does not warn about a stale position when no estimate is shown', async () => {
        // An unexplained warning with no number beside it just looks like a fault.
        mockApi([order], {
            ...dispatchedTracker,
            lifecycle: { show_live_eta: false, show_start_eta: false },
            eta: {},
        });
        const t = await mount(<TodayScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('today-no-eta');
        expect(testIDs(t)).not.toContain('today-stale-location');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows a live arrival once the job has started', async () => {
        mockApi([{ ...order, status: 'enroute' }], {
            ...dispatchedTracker,
            lifecycle: { has_started: true, show_live_eta: true, show_start_eta: false },
            eta: { active_stop_seconds: 420, active_stop_at: '2026-08-22T05:10:00Z' },
            insights: { is_delayed: false, is_location_stale: false },
        });
        const t = await mount(<TodayScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('today-eta-live');
        expect(testIDs(t)).not.toContain('today-stale-location');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says there is no arrival time rather than showing a zero', async () => {
        mockApi([order], { lifecycle: { show_live_eta: false, show_start_eta: false }, eta: {} });
        const t = await mount(<TodayScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('today-no-eta');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('surfaces a delay and being off route', async () => {
        mockApi([{ ...order, status: 'enroute' }], {
            ...dispatchedTracker,
            lifecycle: { has_started: true, show_live_eta: true },
            eta: { active_stop_seconds: 420 },
            insights: { is_delayed: true, delay_seconds: 300, is_off_route: true, is_location_stale: false },
        });
        const t = await mount(<TodayScreen driverId="driver_1" />);
        const ids = testIDs(t);
        expect(ids).toContain('today-delayed');
        expect(ids).toContain('today-off-route');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows progress through the stops', async () => {
        const t = await mount(<TodayScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('today-progress');
        // RouteProgress states the count; the screen adds only the distance.
        expect(textOf(t)).toContain('8.9 km left');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('keeps the order usable when only its tracker fails', async () => {
        mockApi([order], 'fail');
        const t = await mount(<TodayScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('today-tracker-unavailable');
        expect(textOf(t)).toContain('FLE4253599245SG');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('is empty, not broken, with nothing assigned', async () => {
        mockApi([]);
        const t = await mount(<TodayScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('today-empty');
        ReactTestRenderer.act(() => t.unmount());
    });
});
