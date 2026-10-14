import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { OrderTimelineScreen } from '../OrderTimelineScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';
import { orderStore } from '../../data';
import { isRealPoint, placeOf, sortChronologically } from '../../data/useOrderTimeline';

/** Shaped from a live order: null place fields, location at null island. */
const events = [
    {
        id: 'status_b',
        status: 'Order Dispatched',
        details: 'Order has been dispatched.',
        code: 'DISPATCHED',
        city: null,
        province: null,
        country: null,
        location: { type: 'Point', coordinates: [0, 0] },
        created_at: '2026-06-04T17:20:29.000000Z',
    },
    {
        id: 'status_a',
        status: 'Order Created',
        details: 'New order created.',
        code: 'CREATED',
        city: null,
        province: null,
        country: null,
        location: { type: 'Point', coordinates: [0, 0] },
        created_at: '2026-06-04T15:48:06.000000Z',
    },
];

const order = {
    id: 'order_1',
    status: 'dispatched',
    tracking_number: { id: 'track_1', tracking_number: 'FLE4253599245SG' },
    tracking_statuses: events,
};

let fetchMock: jest.Mock;
let queue: MutationQueue;

function mockApi(rows: unknown = events) {
    fetchMock.mockImplementation(() =>
        rows === 'fail'
            ? Promise.reject(new TypeError('Network request failed'))
            : Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(rows) })
    );
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

async function render(scheme: SchemeName = 'dark', seed: object | null = order) {
    if (seed) orderStore.upsert(seed as never);
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider>
                        <FleetbaseProvider host="https://x.test" queue={queue}>
                            <OrderTimelineScreen orderId="order_1" />
                        </FleetbaseProvider>
                    </SyncProvider>
                </Theme>
            </TamaguiProvider>
        );
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

describe('isRealPoint', () => {
    it('rejects null island — every live event carries [0, 0]', () => {
        expect(isRealPoint({ type: 'Point', coordinates: [0, 0] })).toBe(false);
    });

    it('accepts a genuine coordinate', () => {
        expect(isRealPoint({ type: 'Point', coordinates: [103.85, 1.29] })).toBe(true);
    });

    it('rejects missing or malformed geometry', () => {
        expect(isRealPoint(undefined)).toBe(false);
        expect(isRealPoint({ coordinates: [] })).toBe(false);
        expect(isRealPoint({ coordinates: [NaN, 1] })).toBe(false);
    });
});

describe('placeOf', () => {
    it('prefers the named place', () => {
        expect(placeOf({ id: 'x', city: 'Singapore', country: 'SG' })).toBe('Singapore, SG');
    });

    it('is undefined when the place is null and the point is null island', () => {
        // The bug this guards: printing "0.0000, 0.0000" as the driver's location.
        expect(placeOf(events[0])).toBeUndefined();
    });

    it('falls back to real coordinates', () => {
        expect(placeOf({ id: 'x', location: { coordinates: [103.85, 1.29] } })).toBe('1.2900, 103.8500');
    });
});

describe('sortChronologically', () => {
    it('puts the oldest first, so the log reads as progression', () => {
        expect(sortChronologically(events).map((e) => e.code)).toEqual(['CREATED', 'DISPATCHED']);
    });
});

describe('OrderTimelineScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await render(scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('paints immediately from the order the store already has', async () => {
        const t = await render();
        expect(testIDs(t)).toContain('timeline-list');
        expect(textOf(t)).toContain('New order created.');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('marks only the newest entry as current', async () => {
        const t = await render();
        const currents = testIDs(t).filter((id) => id === 'timeline-current');
        expect(currents).toHaveLength(1);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('omits the location rather than printing null island', async () => {
        const t = await render();
        expect(testIDs(t).some((id) => id.startsWith('timeline-place-'))).toBe(false);
        expect(textOf(t)).not.toContain('0.0000');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows a real location when there is one', async () => {
        const located = [{ ...events[1], city: 'Singapore', province: 'SG' }];
        // The refresh writes back over the seed, so both must agree.
        mockApi(located);
        const t = await render('dark', { ...order, tracking_statuses: located });
        expect(textOf(t)).toContain('Singapore, SG');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('flags the sparse state D5 calls for', async () => {
        mockApi([events[1]]);
        const t = await render('dark', { ...order, tracking_statuses: [events[1]] });
        expect(testIDs(t)).toContain('timeline-sparse');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says plainly that no actor is recorded', async () => {
        const t = await render();
        expect(textOf(t)).toContain('do not record who');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('is empty, not broken, when an order has no history', async () => {
        mockApi([]);
        const t = await render('dark', { ...order, tracking_statuses: [] });
        expect(testIDs(t)).toContain('timeline-empty');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('keeps the cached history and warns when the refresh fails', async () => {
        mockApi('fail');
        const t = await render();
        const ids = testIDs(t);
        expect(ids).toContain('timeline-stale');
        // The history the store already had is still on screen.
        expect(ids).toContain('timeline-list');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('captures why the refresh failed, so a transient failure is diagnosable', async () => {
        // The first device run hit exactly this: a refresh that failed on launch
        // while the cached history rendered fine, with nothing saying why.
        mockApi('fail');
        const t = await render();
        expect(textOf(t)).toContain('Network request failed');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('refreshes from tracking-statuses keyed by the tracking number id', async () => {
        await render();
        const urls = fetchMock.mock.calls.map((c) => String(c[0]));
        expect(urls.some((u) => u.includes('tracking-statuses') && u.includes('track_1'))).toBe(true);
    });
});
