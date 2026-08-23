/**
 * Ad-hoc offers — R2 D1.
 *
 * An offer goes to every nearby driver at once, so the assertions here are
 * mostly about not pretending to know who won.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { OffersScreen } from '../OffersScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { orderStore } from '../../data/orderStore';
import { resetLiveRefresh } from '../../realtime/liveRefresh';

const offers = [
    {
        id: 'order_offer1',
        status: 'dispatched',
        adhoc: true,
        adhoc_distance: 2400,
        tracking_number: { tracking_number: 'FLE-OFFER-1' },
        payload: { pickup: { id: 'p1', name: '16 Simon Walk' }, dropoff: { id: 'd1', name: '23 Hougang Avenue 8' } },
    },
    {
        id: 'order_offer2',
        status: 'dispatched',
        adhoc: true,
        payload: { pickup: { id: 'p2', name: '81 Beach Road' } },
    },
];

let queue: MutationQueue;
let fetchMock: jest.Mock;

beforeEach(() => {
    clearV3();
    orderStore.clear();
    resetLiveRefresh();
    queue = new MutationQueue();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => offers });
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
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
const queryCall = () => fetchMock.mock.calls.find(([url]) => String(url).includes('orders?') || String(url).includes('nearby'));

describe('OffersScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<OffersScreen driverId="driver_1" />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('asks only for adhoc, unassigned, dispatched orders near this driver', async () => {
        /*
         * `nearby` is what makes this a list of jobs the driver could take.
         * Without it the query returns every unassigned adhoc order in the
         * company, which is a different and much worse screen.
         */
        await mount(<OffersScreen driverId="driver_1" />);
        const url = String(queryCall()?.[0] ?? '');
        expect(url).toContain('nearby=driver_1');
        expect(url).toContain('adhoc=1');
        expect(url).toContain('unassigned=1');
        expect(url).toContain('dispatched=1');
    });

    it('shows what the job is and how far away', async () => {
        const t = await mount(<OffersScreen driverId="driver_1" />);
        const text = textOf(t);
        expect(text).toContain('16 Simon Walk');
        expect(text).toContain('FLE-OFFER-1');
        expect(text).toMatch(/2\.4 km/);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('accepts by assigning this driver, which is what the endpoint honours', async () => {
        const onOpenOrder = jest.fn();
        const t = await mount(<OffersScreen driverId="driver_1" onOpenOrder={onOpenOrder} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'offer-accept-order_offer1').props as { onPress?: () => void }).onPress?.();
        });

        const accept = fetchMock.mock.calls.find(([url]) => String(url).includes('/start'));
        expect(accept).toBeTruthy();
        expect(JSON.parse((accept?.[1] as { body: string }).body).assign).toBe('driver_1');
        expect(onOpenOrder).toHaveBeenCalledWith('order_offer1');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says someone else took it rather than calling a lost race an error', async () => {
        const t = await mount(<OffersScreen driverId="driver_1" />);
        fetchMock.mockImplementation((url: string) =>
            String(url).includes('/start')
                ? Promise.resolve({ ok: false, status: 400, statusText: 'Bad Request', json: async () => ({ error: 'Order has already started.' }) })
                : Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: async () => offers })
        );

        await ReactTestRenderer.act(async () => {
            (byID(t, 'offer-accept-order_offer1').props as { onPress?: () => void }).onPress?.();
        });

        expect(testIDs(t)).toContain('offer-taken');
        // The card stays: the server decides, and the list is refetched.
        expect(testIDs(t)).toContain('offer-order_offer1');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says so when nothing is on offer', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => [] });
        const t = await mount(<OffersScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('offers-empty');
        ReactTestRenderer.act(() => t.unmount());
    });
});
