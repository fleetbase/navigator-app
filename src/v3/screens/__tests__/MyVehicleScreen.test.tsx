/**
 * My vehicle — R2 E1, read-only.
 *
 * The vehicle resource returns ~100 fields and a stock instance leaves most
 * null, so the assertions here are mostly about what the screen refuses to
 * render, and about being straight regarding where the odometer came from.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { MyVehicleScreen } from '../MyVehicleScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { odometerOf, vehicleTitle, type VehicleRecord } from '../../data/useVehicle';

/** Shaped from a live `GET /v1/vehicles` row. */
const vehicle: VehicleRecord = {
    id: 'vehicle_58gPloyQb9',
    name: 'CEN-01',
    make: 'Toyota',
    model: 'HiAce',
    year: '2025',
    plate_number: 'GBB-1001',
    vin: null,
    status: 'available',
    fuel_type: 'diesel',
    odometer: null,
    odometer_unit: null,
    telematics: {
        last_event_at: '2026-06-23T11:28:08.000000Z',
        last_provider: 'afaqy',
        last_telemetry_data: { odometer: 649337.648227, speed: 8, ignition: true },
    },
};

let queue: MutationQueue;

beforeEach(() => {
    clearV3();
    queue = new MutationQueue();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200, statusText: 'OK', json: async () => vehicle,
    });
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

describe('odometerOf', () => {
    it('prefers the recorded reading when there is one', () => {
        expect(odometerOf({ ...vehicle, odometer: 12000 })).toEqual({ value: 12000, source: 'recorded' });
    });

    it('falls back to telematics, and says that is where it came from', () => {
        // The vehicle's own column is null here while the tracker reports every
        // few minutes — the true number, but not a number a person entered.
        expect(odometerOf(vehicle)).toEqual({ value: 649337.648227, source: 'telematics' });
    });

    it('is undefined when neither exists, rather than zero', () => {
        // Zero is a reading. Absent is not, and a fuel report must not copy it.
        expect(odometerOf({ id: 'v', odometer: null, telematics: null })).toBeUndefined();
    });

    it('treats a recorded zero as a real reading', () => {
        expect(odometerOf({ id: 'v', odometer: 0 })).toEqual({ value: 0, source: 'recorded' });
    });
});

describe('vehicleTitle', () => {
    it('joins only the parts the record has', () => {
        expect(vehicleTitle(vehicle)).toBe('Toyota HiAce 2025');
        expect(vehicleTitle({ id: 'v', make: 'Toyota' })).toBe('Toyota');
        expect(vehicleTitle({ id: 'v' })).toBeUndefined();
    });
});

describe('MyVehicleScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<MyVehicleScreen vehicleId={vehicle.id} seed={vehicle} />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows the name, the model and the plate', async () => {
        const t = await mount(<MyVehicleScreen vehicleId={vehicle.id} seed={vehicle} />);
        const text = textOf(t);
        expect(text).toContain('CEN-01');
        expect(text).toContain('Toyota HiAce 2025');
        expect(text).toContain('GBB-1001');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('names the telematics feed as the odometer’s source', async () => {
        const t = await mount(<MyVehicleScreen vehicleId={vehicle.id} seed={vehicle} />);
        expect(testIDs(t)).toContain('vehicle-odometer-source');
        expect(textOf(t)).toContain('tracker');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('omits the ninety fields a stock instance leaves null', async () => {
        const t = await mount(<MyVehicleScreen vehicleId={vehicle.id} seed={vehicle} />);
        const ids = testIDs(t);
        // VIN is null on this record and must not render an empty row.
        expect(ids).not.toContain('vehicle-row-vin');
        expect(ids).toContain('vehicle-row-plate');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('actually renders the plate, not an empty row', async () => {
        /*
         * Found on device: `Identifier` lays its value out in a `flex: 1`
         * child, which collapses to zero width beside a label in a
         * space-between row — the plate was present in the data and invisible
         * on screen. Assert the value, not the row.
         */
        const t = await mount(<MyVehicleScreen vehicleId={vehicle.id} seed={vehicle} />);
        expect(textOf(t)).toContain('GBB-1001');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('omits a capacity that arrives without a unit', async () => {
        // "160.00" against "Payload" is not information: 160 kg and 160 lb are
        // different vehicles, and the resource carries no unit for it.
        const withPayload = { ...vehicle, payload_capacity: '160.00' };
        (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
            ok: true, status: 200, statusText: 'OK', json: async () => withPayload,
        });
        const t = await mount(<MyVehicleScreen vehicleId={vehicle.id} seed={withPayload} />);
        expect(textOf(t)).not.toContain('160.00');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows no odometer block at all when there is no reading', async () => {
        // The seed is only a first paint; the hook refetches, so the *response*
        // is what decides — mocking the seed alone proves nothing.
        const sparse = { id: 'v', name: 'CEN-02' };
        (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
            ok: true, status: 200, statusText: 'OK', json: async () => sparse,
        });
        const t = await mount(<MyVehicleScreen vehicleId="v" seed={sparse} />);
        expect(testIDs(t)).not.toContain('vehicle-odometer');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says what it cannot do, rather than offering controls that would fail', async () => {
        // assign-vehicle and an odometer endpoint are not on the public
        // namespace, so changing either is not offered.
        const t = await mount(<MyVehicleScreen vehicleId={vehicle.id} seed={vehicle} />);
        expect(testIDs(t)).toContain('vehicle-readonly');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says so when no vehicle is assigned', async () => {
        const t = await mount(<MyVehicleScreen vehicleId={undefined} />);
        expect(testIDs(t)).toContain('vehicle-none');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers the picker when there is no vehicle, which is when it is wanted', async () => {
        // The early return used to end at the message, telling a driver they
        // had no vehicle and giving them no way to get one.
        const onChangeVehicle = jest.fn();
        const t = await mount(<MyVehicleScreen vehicleId={undefined} onChangeVehicle={onChangeVehicle} />);
        expect(testIDs(t)).toContain('vehicle-change');
        ReactTestRenderer.act(() => t.unmount());
    });
});
