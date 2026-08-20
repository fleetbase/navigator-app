import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { OrdersScreen } from '../OrdersScreen';
import { FleetbaseProvider } from '../../api';
import { MutationQueue } from '../../api/queue';
import { SyncProvider } from '../../shell';
import { orderStore, type OrderRecord } from '../../data';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';

const order = (id: string, over: Partial<OrderRecord> = {}): OrderRecord => ({
    id,
    tracking_number: `FLE${id}0636178718SG`,
    status: 'driver_enroute',
    distance: 18200,
    time: 2520,
    customer: { name: 'Priya Patel' },
    payload: {
        pickup: { name: 'Wareham Depot' },
        dropoff: { name: 'Harbour View Pharmacy' },
        entities: [{}, {}, {}],
    },
    ...over,
});

let fetchMock: jest.Mock;

beforeEach(() => {
    clearV3();
    orderStore.clear();
    settingsStore.reset();
    fetchMock = jest.fn().mockResolvedValue({
        ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve([]),
    });
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
});

// Async: the screen fetches on mount, so the promise chain has to settle
// inside act() or React warns and the module is torn down mid-flight.
async function render(scheme: SchemeName = 'dark', props: { driverId?: string } = {}, sync: { isOnline?: boolean } = {}) {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider isOnline={sync.isOnline ?? true}>
                        <FleetbaseProvider host="https://x.test" queue={new MutationQueue()}>
                            <OrdersScreen driverId="driver_1" {...props} />
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
/**
 * Assert on what the driver actually sees. JSON.stringify(toJSON()) trips over
 * circular refs once context providers are in the tree, and serialised props
 * are a weaker assertion than rendered text anyway.
 */
type Node = { children?: unknown[]; props?: Record<string, unknown> } | string | null;

function walk(node: unknown, visit: (n: Exclude<Node, string | null>) => void): void {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) {
        node.forEach((c) => walk(c, visit));
        return;
    }
    visit(node as Exclude<Node, string | null>);
    const children = (node as { children?: unknown[] }).children;
    if (children) children.forEach((c) => walk(c, visit));
}

function textOf(t: ReactTestRenderer.ReactTestRenderer): string {
    const out: string[] = [];
    walk(t.toJSON(), (n) => {
        (n.children ?? []).forEach((c) => {
            if (typeof c === 'string') out.push(c);
        });
    });
    return out.join(' ');
}

function testIDs(t: ReactTestRenderer.ReactTestRenderer): string[] {
    const out: string[] = [];
    walk(t.toJSON(), (n) => {
        const id = n.props?.testID;
        if (typeof id === 'string') out.push(id);
    });
    return out;
}

describe('OrdersScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        ReactTestRenderer.act(() => { orderStore.upsertMany([order('a')]); });
        const t = await render(scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('renders the tracking number in full — never truncated', async () => {
        ReactTestRenderer.act(() => { orderStore.upsertMany([order('a')]); });
        const t = await render();
        const text = textOf(t);
        expect(text).toContain('FLEa0636178718SG');
        expect(text).not.toContain('…');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('segments by lifecycle, not by raw status string', async () => {
        ReactTestRenderer.act(() => {
            orderStore.upsertMany([
                order('active', { status: 'driver_enroute', started_at: '2026-08-20T09:00:00Z' }),
                order('sched', { status: 'created', scheduled_at: '2026-08-21T09:00:00Z', started_at: null, dispatched_at: null }),
                order('done', { status: 'completed' }),
            ]);
        });
        const t = await render();
        // Default segment is Active: only the in-progress order shows.
        const ids = testIDs(t);
        expect(ids).toContain('order-active');
        expect(ids).not.toContain('order-sched');
        expect(ids).not.toContain('order-done');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows a localised empty state per segment, not a blank list', async () => {
        const t = await render();
        expect(testIDs(t)).toContain('orders-empty');
        expect(textOf(t)).toContain('No active orders');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('surfaces a retryable error state when the read fails', async () => {
        fetchMock.mockRejectedValue(new TypeError('Network request failed'));
        const tree = await render();
        expect(testIDs(tree)).toContain('orders-error');
        expect(textOf(tree)).toContain('Retry');
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('keeps cached rows usable offline and says so', async () => {
        ReactTestRenderer.act(() => { orderStore.upsertMany([order('a')]); });
        const t = await render('dark', {}, { isOnline: false });
        const ids = testIDs(t);
        expect(ids).toContain('orders-offline');
        expect(ids).toContain('order-a');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('honours the driver unit preference', async () => {
        ReactTestRenderer.act(() => { orderStore.upsertMany([order('a')]); });

        const metric = await render();
        expect(textOf(metric)).toContain('18.2 km');
        ReactTestRenderer.act(() => metric.unmount());

        ReactTestRenderer.act(() => { settingsStore.set('units', 'imperial'); });
        const imperial = await render();
        expect(textOf(imperial)).toContain('11.3 mi');
        ReactTestRenderer.act(() => imperial.unmount());
    });

    it('pluralises item counts through i18n rather than string concatenation', async () => {
        ReactTestRenderer.act(() => {
            orderStore.upsertMany([order('one', { payload: { pickup: { name: 'A' }, dropoff: { name: 'B' }, entities: [{}] } })]);
        });
        const t = await render();
        const text = textOf(t);
        expect(text).toContain('1 item');
        expect(text).not.toContain('1 items');
        ReactTestRenderer.act(() => t.unmount());
    });
});
