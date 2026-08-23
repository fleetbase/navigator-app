/**
 * Change vehicle — R2 E2.
 *
 * Assignment is `PUT /v1/drivers/{id}` with a vehicle **public id**, resolved
 * server-side against the session's company. The interesting assertions are
 * about which vehicles the app will let a driver pick.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { ChangeVehicleScreen } from '../ChangeVehicleScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { isAssignable } from '../../data/useVehicles';

const fleet = [
    { id: 'vehicle_a', name: 'EAS-01', make: 'Nissan', model: 'NV200', year: '2025', plate_number: 'GBB-1002', status: 'available' },
    { id: 'vehicle_b', name: 'CEN-01', make: 'Toyota', model: 'HiAce', year: '2025', plate_number: 'GBB-1001', status: 'maintenance' },
    { id: 'vehicle_c', name: 'WES-01', make: 'Ford', model: 'Transit', year: '2024', plate_number: 'GBB-1003', status: 'active' },
];

let queue: MutationQueue;
let fetchMock: jest.Mock;

beforeEach(() => {
    clearV3();
    queue = new MutationQueue();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => fleet });
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
const putCalls = () => fetchMock.mock.calls.filter(([, init]) => (init as { method?: string })?.method === 'PUT');

describe('isAssignable', () => {
    it('allows an available or active vehicle', () => {
        expect(isAssignable({ id: 'v', status: 'available' })).toBe(true);
        expect(isAssignable({ id: 'v', status: 'active' })).toBe(true);
    });

    it('refuses one that is off the road', () => {
        for (const status of ['maintenance', 'out_of_service', 'retired', 'accident', 'stolen']) {
            expect(isAssignable({ id: 'v', status })).toBe(false);
        }
    });

    it('allows a status it has never heard of', () => {
        // Listing what is blocked rather than what is allowed: a customer's own
        // vocabulary must not silently hide their fleet.
        expect(isAssignable({ id: 'v', status: 'freshly_valeted' })).toBe(true);
        expect(isAssignable({ id: 'v', status: null })).toBe(true);
    });

    it('normalises before comparing, so "Out of Service" is caught too', () => {
        expect(isAssignable({ id: 'v', status: 'Out of Service' })).toBe(false);
    });
});

describe('ChangeVehicleScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<ChangeVehicleScreen driverId="driver_1" />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('lists the fleet, including vehicles that are off the road', async () => {
        // Shown greyed, not hidden: a driver looking for yesterday's van should
        // learn it is in maintenance, not wonder if the list is broken.
        const t = await mount(<ChangeVehicleScreen driverId="driver_1" />);
        const text = textOf(t);
        expect(text).toContain('EAS-01');
        expect(text).toContain('CEN-01');
        expect(text).toContain('WES-01');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('assigns by public id, which is what the endpoint resolves', async () => {
        const t = await mount(<ChangeVehicleScreen driverId="driver_1" currentVehicleId="vehicle_a" />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'vehicle-option-vehicle_c').props as { onPress?: () => void }).onPress?.();
        });
        expect(putCalls()).toHaveLength(1);
        expect(String(putCalls()[0][0])).toContain('drivers/driver_1');
        expect(JSON.parse((putCalls()[0][1] as { body: string }).body).vehicle).toBe('vehicle_c');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('will not assign one that is off the road', async () => {
        const t = await mount(<ChangeVehicleScreen driverId="driver_1" />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'vehicle-option-vehicle_b').props as { onPress?: () => void }).onPress?.();
        });
        expect(putCalls()).toHaveLength(0);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('will not re-assign the one already assigned', async () => {
        const t = await mount(<ChangeVehicleScreen driverId="driver_1" currentVehicleId="vehicle_a" />);
        expect(testIDs(t)).toContain('vehicle-current-vehicle_a');
        await ReactTestRenderer.act(async () => {
            (byID(t, 'vehicle-option-vehicle_a').props as { onPress?: () => void }).onPress?.();
        });
        expect(putCalls()).toHaveLength(0);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('queues the change offline and says so', async () => {
        // The list has to load before the write can fail — mount first, then
        // drop the connection. Rejecting up front just tests the error state.
        const onDone = jest.fn();
        const t = await mount(<ChangeVehicleScreen driverId="driver_1" onDone={onDone} />, 'dark', { isOnline: false });
        fetchMock.mockRejectedValue(new TypeError('Network request failed'));

        await ReactTestRenderer.act(async () => {
            (byID(t, 'vehicle-option-vehicle_c').props as { onPress?: () => void }).onPress?.();
        });

        expect(testIDs(t)).toContain('change-vehicle-queued');
        // Not closed behind the driver on a change that has not landed.
        expect(onDone).not.toHaveBeenCalled();
        ReactTestRenderer.act(() => t.unmount());
    });
});
