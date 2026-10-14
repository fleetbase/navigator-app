/**
 * Edit destination — R2 D2.
 *
 * The endpoint only accepts stops already on the order, so most of what matters
 * here is which stop the app sends and which ones it refuses to offer.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { DestinationScreen } from '../DestinationScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { destinationKeyOf } from '../../data/useSetDestination';
import { orderStore } from '../../data/orderStore';

/*
 * Shaped from a live `GET /v1/orders/{id}`. The stops and the current one come
 * from the payload — `current_waypoint` is a place id, and it is what the
 * server writes when set-destination is called.
 */
const order = {
    id: 'order_1',
    status: 'dispatched',
    payload: {
        pickup: { id: 'place_pickup', name: '16 Simon Walk' },
        waypoints: [{ id: 'place_wp', name: '81 Beach Road' }],
        dropoff: { id: 'place_dropoff', name: '23 Hougang Avenue 8' },
        current_waypoint: 'place_wp',
    },
};

/** The tracker contributes only which stops are already done. */
const tracker = {
    stops: [{ uuid: 'place_pickup', public_id: 'place_pickup', completed: true }],
};

let queue: MutationQueue;
let fetchMock: jest.Mock;

beforeEach(() => {
    clearV3();
    orderStore.clear();
    orderStore.upsert(order as never);
    queue = new MutationQueue();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => tracker });
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
});

async function mount(node: React.ReactNode, scheme: SchemeName = 'dark', sync: { isOnline?: boolean } = {}) {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider isOnline={sync.isOnline ?? true}>
                        <FleetbaseProvider host="https://x.test" queue={queue}>
                            {node}
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
    walk(t.toJSON(), (n) => {
        const id = n.props?.testID;
        if (typeof id === 'string') out.push(id);
    });
    return out;
};
const byID = (t: ReactTestRenderer.ReactTestRenderer, id: string) => t.root.findAll((n) => n.props?.testID === id)[0];
const setCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('set-destination'));

describe('destinationKeyOf', () => {
    it('prefers the uuid, which the server matches first', () => {
        expect(destinationKeyOf({ uuid: 'wp-2', public_id: 'place_two' })).toBe('wp-2');
    });

    it('falls back to the public id, which also resolves', () => {
        expect(destinationKeyOf({ public_id: 'place_two' })).toBe('place_two');
    });

    it('is undefined for a stop with neither, so nothing is sent', () => {
        expect(destinationKeyOf({})).toBeUndefined();
        expect(destinationKeyOf(null)).toBeUndefined();
    });
});

describe('DestinationScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<DestinationScreen orderId="order_1" />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('lists every stop on the order, in the order they are worked', async () => {
        const t = await mount(<DestinationScreen orderId="order_1" />);
        const text = textOf(t);
        expect(text).toContain('16 Simon Walk');
        expect(text).toContain('81 Beach Road');
        expect(text).toContain('23 Hougang Avenue 8');
        expect(text.indexOf('16 Simon Walk')).toBeLessThan(text.indexOf('81 Beach Road'));
        expect(text.indexOf('81 Beach Road')).toBeLessThan(text.indexOf('23 Hougang Avenue 8'));
        ReactTestRenderer.act(() => t.unmount());
    });

    it('marks the one being headed to, and the one already done', async () => {
        const t = await mount(<DestinationScreen orderId="order_1" />);
        const ids = testIDs(t);
        expect(ids).toContain('destination-current-place_wp');
        // Completion is the tracker's contribution; identity is the payload's.
        expect(ids).toContain('destination-done-place_pickup');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('sends the chosen stop to set-destination', async () => {
        const t = await mount(<DestinationScreen orderId="order_1" />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'destination-stop-place_dropoff').props as { onPress?: () => void }).onPress?.();
        });
        expect(setCalls()).toHaveLength(1);
        expect(String(setCalls()[0][0])).toContain('orders/order_1/set-destination/place_dropoff');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('will not re-head to a completed stop', async () => {
        // Shown for context, but not something the app should quietly allow.
        const t = await mount(<DestinationScreen orderId="order_1" />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'destination-stop-place_pickup').props as { onPress?: () => void }).onPress?.();
        });
        expect(setCalls()).toHaveLength(0);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('will not re-send the stop already being headed to', async () => {
        const t = await mount(<DestinationScreen orderId="order_1" />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'destination-stop-place_wp').props as { onPress?: () => void }).onPress?.();
        });
        expect(setCalls()).toHaveLength(0);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('queues the change offline and says so, without faking the new state', async () => {
        /*
         * Everything else on this screen is the server's computation over the
         * payload. Rewriting one field of it locally would show a view that is
         * neither what the driver chose nor what dispatch sees.
         */
        const t = await mount(<DestinationScreen orderId="order_1" />, 'dark', { isOnline: false });
        fetchMock.mockRejectedValue(new TypeError('Network request failed'));
        await ReactTestRenderer.act(async () => {
            (byID(t, 'destination-stop-place_dropoff').props as { onPress?: () => void }).onPress?.();
        });
        const ids = testIDs(t);
        expect(ids).toContain('destination-queued');
        // Still marked as heading to the stop the payload last said.
        expect(ids).toContain('destination-current-place_wp');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says so when the order has no stops at all', async () => {
        orderStore.clear();
        orderStore.upsert({ id: 'order_1', status: 'dispatched', payload: {} } as never);
        fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => ({ stops: [] }) });
        const t = await mount(<DestinationScreen orderId="order_1" />);
        expect(testIDs(t)).toContain('destination-empty');
        ReactTestRenderer.act(() => t.unmount());
    });
});
