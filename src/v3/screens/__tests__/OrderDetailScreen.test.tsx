import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { OrderDetailScreen } from '../OrderDetailScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { orderStore, clearOrderConfigCache, recordProof, resetProofLedger, type OrderRecord } from '../../data';
import { recordOrderChange, resetOrderChanges, bumpLiveRefresh } from '../../realtime';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';

/** Flows of 2, 5 and 7 — the stepper must not assume the mockup's four. */
const FLOWS = {
    two: [
        { code: 'created', status: 'Created' },
        { code: 'completed', status: 'Completed', complete: true },
    ],
    five: [
        { code: 'created', status: 'Created' },
        { code: 'dispatched', status: 'Dispatched' },
        { code: 'driver_enroute', status: 'Driver Enroute' },
        { code: 'arrived', status: 'Arrived', require_pod: true },
        { code: 'completed', status: 'Completed', complete: true },
    ],
    seven: [
        { code: 'created', status: 'Created' },
        { code: 'preparing', status: 'Preparing' },
        { code: 'dispatched', status: 'Dispatched' },
        { code: 'driver_assigned', status: 'Assigned' },
        { code: 'driver_enroute', status: 'Driver Enroute' },
        { code: 'arrived', status: 'Arrived' },
        { code: 'completed', status: 'Completed', complete: true },
    ],
};

const order = (over: Partial<OrderRecord> = {}): OrderRecord => ({
    id: 'order_1',
    tracking_number: 'FLE0636178718SG',
    status: 'driver_enroute',
    created_at: '2026-08-20T09:02:00Z',
    order_config: { id: 'cfg_1' },
    payload: { dropoff: { name: 'Harbour View Pharmacy' }, entities: [{ id: 'e1', name: 'Rx box', tracking_number: 'ENT-000004471-A' }] },
    ...over,
});

let fetchMock: jest.Mock;

function mockConfig(flow: unknown[]) {
    fetchMock.mockImplementation((url: string) =>
        Promise.resolve({
            ok: true, status: 200, statusText: 'OK',
            json: () => Promise.resolve(String(url).includes('order-configs') ? { id: 'cfg_1', flow } : {}),
        })
    );
}

beforeEach(() => {
    clearV3();
    orderStore.clear();
    resetOrderChanges();
    resetProofLedger();
    clearOrderConfigCache();
    settingsStore.reset();
    fetchMock = jest.fn();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    mockConfig(FLOWS.five);
});

async function render(scheme: SchemeName = 'dark', sync: { isOnline?: boolean } = {}) {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider isOnline={sync.isOnline ?? true}>
                        <FleetbaseProvider host="https://x.test" queue={new MutationQueue()}>
                            <OrderDetailScreen orderId="order_1" />
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

/** Same tree as `render`, with props the default helper does not take. */
async function renderWith(props: Partial<React.ComponentProps<typeof OrderDetailScreen>>, scheme: SchemeName = 'dark') {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider isOnline>
                        <FleetbaseProvider host="https://x.test" queue={new MutationQueue()}>
                            <OrderDetailScreen orderId="order_1" {...props} />
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
const byID = (t: ReactTestRenderer.ReactTestRenderer, id: string) => t.root.findAll((n) => n.props?.testID === id)[0];
const testIDs = (t: ReactTestRenderer.ReactTestRenderer) => {
    const out: string[] = [];
    walk(t.toJSON(), (n) => typeof n.props?.testID === 'string' && out.push(n.props.testID as string));
    return out;
};

describe('OrderDetailScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        ReactTestRenderer.act(() => { orderStore.upsert(order()); });
        const t = await render(scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    // The whole point of correction 1: the stepper is not four fixed steps.
    it.each([
        ['two', 2] as const,
        ['five', 5] as const,
        ['seven', 7] as const,
    ])('renders a %s-step flow from the order config', async (name, count) => {
        mockConfig(FLOWS[name]);
        ReactTestRenderer.act(() => { orderStore.upsert(order()); });
        const t = await render();
        const steps = testIDs(t).filter((id) => id.startsWith('step-'));
        expect(steps).toHaveLength(count);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('uses the registry label, not the config wording', async () => {
        ReactTestRenderer.act(() => { orderStore.upsert(order()); });
        const t = await render();
        const text = textOf(t);
        // Config says "Driver Enroute"; the design says "En route".
        expect(text).toContain('En route');
        expect(text).not.toContain('Driver Enroute');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers the next activity, not a hardcoded one', async () => {
        ReactTestRenderer.act(() => { orderStore.upsert(order({ status: 'dispatched' })); });
        const t = await render();
        expect(textOf(t)).toContain('En route');
        expect(testIDs(t)).toContain('advance-activity');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers nothing at a terminal activity', async () => {
        ReactTestRenderer.act(() => { orderStore.upsert(order({ status: 'completed' })); });
        const t = await render();
        const ids = testIDs(t);
        expect(ids).not.toContain('advance-activity');
        expect(ids).toContain('order-terminal');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('flags when the next step will demand proof', async () => {
        ReactTestRenderer.act(() => { orderStore.upsert(order({ status: 'driver_enroute' })); });
        const t = await render();
        expect(testIDs(t)).toContain('proof-required');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('degrades honestly when the config cannot be loaded', async () => {
        fetchMock.mockRejectedValue(new TypeError('Network request failed'));
        ReactTestRenderer.act(() => { orderStore.upsert(order()); });
        const t = await render();
        const ids = testIDs(t);
        expect(ids).toContain('flow-unavailable');
        // No invented flow, and therefore no action to advance into.
        expect(ids.filter((i) => i.startsWith('step-'))).toHaveLength(0);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('reads the config flow in lifecycle order, not array order', async () => {
        /*
         * Taken verbatim from the dev instance: the public order-configs
         * payload carries no sequencing data, and this real config lists
         * `completed` fourth and `dispatched` last. Reading array position as
         * progress painted every earlier step green and declared a freshly
         * dispatched order finished, with no way to advance it.
         */
        mockConfig([
            { code: 'created', status: 'Order Created', complete: false },
            { code: 'enroute', status: 'Driver Enroute', complete: false },
            { code: 'started', status: 'Order Started', complete: false },
            { code: 'completed', status: 'Order Completed', complete: true },
            { code: 'dispatched', status: 'Order Dispatched', complete: false },
        ]);
        ReactTestRenderer.act(() => { orderStore.upsert(order({ status: 'dispatched' })); });
        const t = await render();
        const ids = testIDs(t);

        // Not finished, and not off-flow either — there is a real next step.
        expect(ids).not.toContain('order-terminal');
        expect(ids).not.toContain('order-off-flow');
        expect(ids).toContain('advance-activity');
        // The step after `dispatched` in the lifecycle is en route.
        expect(textOf(t)).toContain('En route');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('does not call an order complete just because nothing follows it', async () => {
        // `completed` is the only activity carrying the terminal flag.
        mockConfig([
            { code: 'created', complete: false },
            { code: 'completed', complete: true },
            { code: 'dispatched', complete: false },
        ]);
        ReactTestRenderer.act(() => { orderStore.upsert(order({ status: 'completed' })); });
        const t = await render();
        expect(testIDs(t)).toContain('order-terminal');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('walks the transition graph when the config carries one', async () => {
        /*
         * The documented model: `activities` names the codes an activity can
         * transition to, and `sequence` orders siblings. Array position means
         * nothing — here `completed` is declared before the step that leads to
         * it, and `dispatched` last.
         */
        mockConfig([
            { code: 'completed', status: 'Order Completed', complete: true, activities: [] },
            { code: 'enroute', status: 'Driver Enroute', activities: ['completed'] },
            { code: 'created', status: 'Order Created', activities: ['dispatched'] },
            { code: 'dispatched', status: 'Order Dispatched', activities: ['enroute'] },
        ]);
        ReactTestRenderer.act(() => { orderStore.upsert(order({ status: 'dispatched' })); });
        const t = await render();

        expect(testIDs(t)).toContain('advance-activity');
        expect(textOf(t)).toContain('En route');
        expect(testIDs(t)).not.toContain('order-terminal');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('defers to dispatch when logic decides which way the order goes', async () => {
        // Two candidate children, one gated by conditions expressed against the
        // server's order model. Offering a guess would be offering a refusal.
        mockConfig([
            { code: 'arrived', status: 'Arrived', activities: ['completed', 'failed'] },
            { code: 'completed', status: 'Order Completed', complete: true, sequence: 1 },
            { code: 'failed', status: 'Failed', sequence: 2, logic: [{ type: 'and', conditions: [] }] },
        ]);
        ReactTestRenderer.act(() => { orderStore.upsert(order({ status: 'arrived' })); });
        const t = await render();

        const ids = testIDs(t);
        expect(ids).toContain('next-ambiguous');
        expect(ids).not.toContain('advance-activity');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('captures proof before advancing, never after', async () => {
        /*
         * The config decides. An activity with require_pod must not be fired
         * until the proof exists — otherwise an order reads as delivered with
         * nothing attached, and afterwards nobody can tell whether the driver
         * was even asked.
         */
        mockConfig([
            { code: 'dispatched', status: 'Order Dispatched', activities: ['completed'] },
            { code: 'completed', status: 'Order Completed', complete: true, require_pod: true, pod_method: 'signature' },
        ]);
        ReactTestRenderer.act(() => { orderStore.upsert(order({ status: 'dispatched' })); });

        const onCaptureProof = jest.fn();
        const t = await renderWith({ onCaptureProof });
        const before = fetchMock.mock.calls.length;

        await ReactTestRenderer.act(async () => {
            (byID(t, 'advance-activity').props as { onPress?: () => void }).onPress?.();
        });

        expect(onCaptureProof).toHaveBeenCalledWith(
            expect.objectContaining({ activityCode: 'completed', podMethod: 'signature' })
        );
        // And crucially: the activity update has NOT been sent.
        const activityCalls = fetchMock.mock.calls.slice(before).filter(([url]) => String(url).includes('update-activity'));
        expect(activityCalls).toHaveLength(0);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('advances straight away when the activity asks for no proof', async () => {
        mockConfig([
            { code: 'dispatched', status: 'Order Dispatched', activities: ['enroute'] },
            { code: 'enroute', status: 'Driver Enroute', require_pod: false },
        ]);
        ReactTestRenderer.act(() => { orderStore.upsert(order({ status: 'dispatched' })); });

        const onCaptureProof = jest.fn();
        const t = await renderWith({ onCaptureProof });
        await ReactTestRenderer.act(async () => {
            (byID(t, 'advance-activity').props as { onPress?: () => void }).onPress?.();
        });

        expect(onCaptureProof).not.toHaveBeenCalled();
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('update-activity'))).toBe(true);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers a destination change only when there is more than one stop', async () => {
        // A button that opens a list of one is a button that wasted a tap.
        ReactTestRenderer.act(() => {
            orderStore.upsert(order({ payload: { dropoff: { name: 'Harbour View Pharmacy' }, entities: [] } }));
        });
        const single = await renderWith({ onChangeDestination: jest.fn() });
        expect(testIDs(single)).not.toContain('change-destination');
        ReactTestRenderer.act(() => single.unmount());

        ReactTestRenderer.act(() => {
            orderStore.upsert(
                order({
                    payload: {
                        dropoff: { id: 'place_d', name: 'Harbour View Pharmacy' },
                        entities: [],
                        waypoints: [{ id: 'place_w1', name: '81 Beach Road' }, { id: 'place_w2', name: '5 Changi Business Park' }],
                    },
                })
            );
        });
        const many = await renderWith({ onChangeDestination: jest.fn() });
        expect(testIDs(many)).toContain('change-destination');
        ReactTestRenderer.act(() => many.unmount());
    });

    it('counts pickup and drop-off as stops, not just waypoints', async () => {
        /*
         * Found on the device: a plain pickup → drop-off order carries no
         * `waypoints` at all, so counting only those hid the button on exactly
         * the order that has two places to be.
         */
        ReactTestRenderer.act(() => {
            orderStore.upsert(order({ payload: { pickup: { name: '16 Simon Walk' }, dropoff: { name: '23 Hougang Avenue 8' }, entities: [] } }));
        });
        const t = await renderWith({ onChangeDestination: jest.fn() });
        expect(testIDs(t)).toContain('change-destination');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('names the stop being headed to, not the final drop-off', async () => {
        /*
         * Found on the device: the card read "Current destination: 23 Hougang
         * Avenue 8" while the driver was on their way to the pickup. It was
         * showing `payload.dropoff`, which is where the order *ends* — on a
         * multi-stop order that is a different place, and the tracker is the
         * only thing that knows which.
         */
        fetchMock.mockImplementation((url: string) =>
            Promise.resolve({
                ok: true, status: 200, statusText: 'OK',
                json: () =>
                    Promise.resolve(
                        String(url).includes('tracker')
                            ? { active_stop: { uuid: 'wp-1', name: '16 Simon Walk' }, stops: [] }
                            : String(url).includes('order-configs')
                              ? { id: 'cfg_1', flow: FLOWS.five }
                              : {}
                    ),
            })
        );
        ReactTestRenderer.act(() => {
            orderStore.upsert(order({ payload: { pickup: { name: '16 Simon Walk' }, dropoff: { name: '23 Hougang Avenue 8' }, entities: [] } }));
        });
        const t = await render();
        const text = textOf(t);
        expect(text).toContain('16 Simon Walk');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says so when the config declares no flow at all', async () => {
        // A config that loads cleanly but carries an empty flow used to render
        // nothing: no stepper, no message, and no way to advance the order.
        mockConfig([]);
        ReactTestRenderer.act(() => { orderStore.upsert(order()); });
        const t = await render();
        const ids = testIDs(t);
        expect(ids).toContain('flow-not-configured');
        expect(ids).not.toContain('flow-unavailable');
        expect(ids.filter((i) => i.startsWith('step-'))).toHaveLength(0);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('does not say "0 items" twice on an empty payload', async () => {
        ReactTestRenderer.act(() => {
            orderStore.upsert(order({ payload: { dropoff: { name: 'Harbour View Pharmacy' }, entities: [] } }));
        });
        const t = await render();
        const zeroes = textOf(t).match(/0 items/g) ?? [];
        expect(zeroes).toHaveLength(1);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('renders identifiers in full', async () => {
        ReactTestRenderer.act(() => { orderStore.upsert(order()); });
        const t = await render();
        const text = textOf(t);
        expect(text).toContain('FLE0636178718SG');
        expect(text).toContain('ENT-000004471-A');
        expect(text).not.toContain('…');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('queues the activity update offline and advances optimistically', async () => {
        ReactTestRenderer.act(() => { orderStore.upsert(order({ status: 'dispatched' })); });
        const t = await render('dark', { isOnline: false });

        // Config loaded; now the mutation fails at the transport layer.
        fetchMock.mockRejectedValue(new TypeError('Network request failed'));

        const btn = t.root.findAll((n) => n.props?.testID === 'advance-activity')[0];
        await ReactTestRenderer.act(async () => {
            (btn.props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });

        expect(orderStore.get('order_1')?.status).toBe('driver_enroute');
        expect(testIDs(t)).toContain('advance-queued');
        ReactTestRenderer.act(() => t.unmount());
    });
});

/* -- Order operations (contract 1, 4, 5, 6). ---------------------------- */

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) });

/** Most specific fragment first: `orders/order_1` also matches its sub-routes. */
function mockRoutes(routes: [string, unknown | ((url: string, init?: { method?: string; body?: string }) => unknown)][], flow: unknown[] = FLOWS.five) {
    fetchMock.mockImplementation((url: string, init?: { method?: string; body?: string }) => {
        const u = String(url);
        for (const [fragment, body] of routes) {
            if (u.includes(fragment)) return ok(typeof body === 'function' ? (body as (u: string, i?: unknown) => unknown)(u, init) : body);
        }
        return ok(u.includes('order-configs') ? { id: 'cfg_1', flow } : {});
    });
}

const press = async (t: ReactTestRenderer.ReactTestRenderer, id: string) => {
    await ReactTestRenderer.act(async () => {
        (byID(t, id).props as { onPress?: () => void }).onPress?.();
        await Promise.resolve();
    });
};

const calls = (fragment: string, method?: string) =>
    fetchMock.mock.calls.filter(([url, init]) => String(url).includes(fragment) && (!method || (init as { method?: string } | undefined)?.method === method));

describe('OrderDetailScreen — order operations', () => {
    const located = (lng: number, lat: number) => ({ type: 'Point', coordinates: [lng, lat] });

    it('shows what changed, and offers to re-open navigation when the drop-off moved', async () => {
        ReactTestRenderer.act(() => {
            orderStore.upsert(order({ payload: { dropoff: { id: 'place_d', name: '8 Marina View', location: located(103.85, 1.28) }, entities: [] } }));
            recordOrderChange({ orderId: 'order_1', summary: 'Drop-off changed to 8 Marina View, Tower B', changes: ['dropoff'] });
        });
        const onNavigate = jest.fn();
        const t = await renderWith({ onNavigate });
        expect(textOf(t)).toContain('Drop-off changed to 8 Marina View, Tower B');
        await press(t, 'order-changed-reopen-navigation');
        expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ latitude: 1.28, longitude: 103.85 }));
        expect(testIDs(t)).not.toContain('order-changed');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('does not offer navigation for a change that did not move the drop-off', async () => {
        ReactTestRenderer.act(() => {
            orderStore.upsert(order({ payload: { dropoff: { name: 'X', location: located(1, 2) }, entities: [] } }));
            recordOrderChange({ orderId: 'order_1', summary: 'Note added', changes: ['notes'] });
        });
        const t = await renderWith({ onNavigate: jest.fn() });
        expect(testIDs(t)).toContain('order-changed');
        expect(testIDs(t)).not.toContain('order-changed-reopen-navigation');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('navigates to the stop being headed to, not the final drop-off', async () => {
        ReactTestRenderer.act(() => {
            orderStore.upsert(
                order({
                    payload: {
                        pickup: { id: 'place_p', name: 'Wareham Depot', location: located(10, 20) },
                        dropoff: { id: 'place_d', name: 'Harbour View', location: located(30, 40) },
                        current_waypoint: 'place_p',
                        entities: [],
                    },
                })
            );
        });
        const onNavigate = jest.fn();
        const t = await renderWith({ onNavigate });
        await press(t, 'navigate-to-dropoff');
        expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ latitude: 20, longitude: 10 }));
        ReactTestRenderer.act(() => t.unmount());
    });

    it('refetches the order when the server says something moved', async () => {
        ReactTestRenderer.act(() => { orderStore.upsert(order()); });
        const t = await render();
        const exact = () => fetchMock.mock.calls.filter(([url]) => /\/orders\/order_1(\?|$)/.test(String(url))).length;
        const before = exact();
        await ReactTestRenderer.act(async () => {
            bumpLiveRefresh();
            await Promise.resolve();
        });
        expect(exact()).toBeGreaterThan(before);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows quantities, notes, unavailable items and substitutes', async () => {
        ReactTestRenderer.act(() => {
            orderStore.upsert(
                order({
                    payload: {
                        dropoff: { name: 'X' },
                        entities: [
                            { internal_id: 'e1', name: 'Iced Latte', meta: { quantity: 2, note: 'No ice' } },
                            { internal_id: 'e2', name: 'Croissant', meta: { unavailable: true } },
                            { internal_id: 'e3', name: 'Pain au chocolat', meta: { substitute_for: 'e2' } },
                        ],
                    },
                })
            );
        });
        const t = await render();
        const text = textOf(t);
        expect(text).toContain('2 ×');
        expect(text).toContain('Note: No ice');
        expect(testIDs(t)).toContain('entity-e2-unavailable');
        expect(text).toContain('Substitute for Croissant');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('holds completion until cash on delivery is confirmed as collected', async () => {
        mockConfig(FLOWS.two);
        ReactTestRenderer.act(() => {
            orderStore.upsert(
                order({
                    status: 'created',
                    meta: { payment: { state: 'to_collect' } },
                    payload: { dropoff: { name: 'X' }, entities: [], cod_amount: 5000, cod_currency: 'SGD' },
                })
            );
        });
        const t = await render();
        expect(testIDs(t)).toContain('cod-to-collect');
        expect(testIDs(t)).toContain('cod-confirm-first');
        expect((byID(t, 'advance-activity').props as { disabled?: boolean }).disabled).toBe(true);

        await press(t, 'cod-confirm');
        expect(testIDs(t)).toContain('cod-collected');
        expect((byID(t, 'advance-activity').props as { disabled?: boolean }).disabled).toBe(false);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('asks nothing when the payment summary says it is paid', async () => {
        mockConfig(FLOWS.two);
        ReactTestRenderer.act(() => {
            orderStore.upsert(order({ status: 'created', meta: { payment: { state: 'paid' } }, payload: { dropoff: { name: 'X' }, entities: [], cod_amount: 5000 } }));
        });
        const t = await render();
        expect(testIDs(t)).toContain('cod-settled');
        expect(testIDs(t)).not.toContain('cod-confirm');
        expect((byID(t, 'advance-activity').props as { disabled?: boolean }).disabled).toBe(false);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('takes the next step from the server when it answers, resolving a branch instead of deferring it', async () => {
        const flow = [
            { code: 'arrived', status: 'Arrived', activities: ['completed', 'failed'] },
            { code: 'completed', status: 'Order Completed', complete: true, sequence: 1 },
            { code: 'failed', status: 'Failed', sequence: 2, logic: [{ type: 'and', conditions: [] }] },
        ];
        mockRoutes([['next-activity', [{ code: 'completed', status: 'Order Completed', complete: true }, { code: 'failed', status: 'Failed' }]]], flow);
        ReactTestRenderer.act(() => { orderStore.upsert(order({ status: 'arrived' })); });
        const t = await render();
        await ReactTestRenderer.act(async () => { await Promise.resolve(); });
        const ids = testIDs(t);
        expect(ids).not.toContain('next-ambiguous');
        expect(ids).toContain('advance-activity');
        expect(ids).toContain('advance-activity-failed');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('advances with the captured proof instead of asking for it again', async () => {
        mockConfig([
            { code: 'dispatched', status: 'Order Dispatched', activities: ['completed'] },
            { code: 'completed', status: 'Order Completed', complete: true, require_pod: true, pod_method: 'signature' },
        ]);
        ReactTestRenderer.act(() => {
            orderStore.upsert(order({ status: 'dispatched' }));
            recordProof('order_1', 'completed', { proofId: 'proof_9' });
        });
        const onCaptureProof = jest.fn();
        const t = await renderWith({ onCaptureProof });
        await ReactTestRenderer.act(async () => { await Promise.resolve(); });

        expect(onCaptureProof).not.toHaveBeenCalled();
        const updates = calls('update-activity', 'POST');
        expect(updates).toHaveLength(1);
        expect(JSON.parse(String((updates[0][1] as { body?: string }).body))).toMatchObject({ activity: 'completed', proof: 'proof_9' });
        ReactTestRenderer.act(() => t.unmount());
    });

    it('leaves when the order is reassigned away from this driver', async () => {
        ReactTestRenderer.act(() => { orderStore.upsert(order()); });
        const onRemoved = jest.fn();
        const t = await renderWith({ onRemoved });
        await ReactTestRenderer.act(async () => {
            orderStore.remove('order_1', 'reassigned');
        });
        expect(onRemoved).toHaveBeenCalledWith('reassigned');
        expect(testIDs(t)).toContain('order-detail-removed');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('labels a booking as a job, with its slot and a bring-to-the-job checklist', async () => {
        ReactTestRenderer.act(() => {
            orderStore.upsert(
                order({
                    meta: { is_booking: true, booking: { start: '2026-10-14T09:00:00Z', end: '2026-10-14T10:00:00Z', provider: 'driver_me' } },
                    payload: { dropoff: { name: 'X' }, entities: [{ internal_id: 'p1', name: 'Pressure washer', meta: { quantity: 1 } }] },
                })
            );
        });
        const t = await render();
        const ids = testIDs(t);
        expect(ids).toContain('order-kind-job');
        expect(ids).toContain('order-schedule');
        expect(ids).toContain('bring-checklist');
        expect(textOf(t)).toContain('Bring to the job');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('calls the customer, and messages them and dispatch through the order\'s threads', async () => {
        const dispatchThread = { id: 'chat_channel_d', meta: { order_public_id: 'order_1', kind: 'driver' } };
        const groupThread = { id: 'chat_channel_g', meta: { order_public_id: 'order_1', kind: 'group' } };
        mockRoutes([['chat-channels', [dispatchThread, groupThread, { id: 'chat_channel_other', meta: { order_public_id: 'order_2', kind: 'driver' } }]]]);
        ReactTestRenderer.act(() => {
            orderStore.upsert(order({ customer: { name: 'Priya Patel', phone: '+6590000000' } }));
        });
        const openUrl = jest.fn(() => Promise.resolve());
        const onOpenChannel = jest.fn();
        const t = await renderWith({ openUrl, onOpenChannel, onMessageDispatch: jest.fn() });
        await ReactTestRenderer.act(async () => { await Promise.resolve(); });

        await press(t, 'call-customer');
        expect(openUrl).toHaveBeenCalledWith('tel:+6590000000');
        await press(t, 'message-dispatch');
        expect(onOpenChannel).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'chat_channel_d' }));
        await press(t, 'message-customer');
        expect(onOpenChannel).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'chat_channel_g' }));
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows delivery instructions and the scheduled window', async () => {
        ReactTestRenderer.act(() => {
            orderStore.upsert(
                order({
                    scheduled_at: '2026-10-14T09:00:00Z',
                    notes: 'Ring twice',
                    payload: { dropoff: { name: 'X', meta: { instructions: 'Leave with the concierge' } }, entities: [] },
                })
            );
        });
        const t = await render();
        const text = textOf(t);
        expect(text).toContain('Leave with the concierge');
        expect(text).toContain('Ring twice');
        expect(testIDs(t)).toContain('order-schedule');
        ReactTestRenderer.act(() => t.unmount());
    });
});
