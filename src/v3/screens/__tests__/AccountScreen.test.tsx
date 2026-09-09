import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { AccountScreen } from '../AccountScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';
import { vehicleOf, vehicleDescription, type DriverRecord } from '../../data';

/** Shaped from a live `GET /v1/drivers/{id}`. */
const driver: DriverRecord = {
    id: 'driver_qT49LFY3yn',
    user: 'user_gkASIhJU3V',
    name: 'Ron',
    email: 'ron@fleetbase.io',
    phone: '+19809341969',
    internal_id: 'FP138717',
    status: 'available',
    online: false,
    drivers_license_number: null,
    license_expiry: null,
    company_name: 'Fleetbase Pte Ltd',
    vehicle: { id: 'vehicle_xDcnbXsot0', name: 'EAS-01', make: 'Toyota', model: 'Hiace', year: 2021 },
};

const organization = { id: 'company_hfUOJNWBuO', name: 'Fleetbase Pte Ltd', currency: 'SGD' };

let fetchMock: jest.Mock;
let queue: MutationQueue;

function mockApi(driverBody: unknown = driver, orgBody: unknown = organization) {
    fetchMock.mockImplementation((url: string) => {
        const u = String(url);
        const body = u.includes('organizations/current') ? orgBody : driverBody;
        if (body === 'fail') return Promise.reject(new TypeError('Network request failed'));
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) });
    });
}

beforeEach(() => {
    clearV3();
    settingsStore.reset();
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
const byID = (t: ReactTestRenderer.ReactTestRenderer, id: string) => t.root.findAll((n) => n.props?.testID === id)[0];

describe('vehicle helpers', () => {
    it('reads the vehicle object the driver resource carries', () => {
        expect(vehicleOf(driver)?.name).toBe('EAS-01');
    });

    it('accepts a bare name string, which other endpoints return', () => {
        expect(vehicleOf({ ...driver, vehicle: 'CEN-01' })?.name).toBe('CEN-01');
    });

    it('is undefined when no vehicle is assigned', () => {
        expect(vehicleOf({ ...driver, vehicle: null })).toBeUndefined();
    });

    it('describes only the parts the record actually has', () => {
        expect(vehicleDescription({ make: 'Toyota', model: 'Hiace', year: 2021 })).toBe('Toyota Hiace 2021');
        expect(vehicleDescription({ make: 'Toyota' })).toBe('Toyota');
        expect(vehicleDescription({})).toBeUndefined();
    });
});

describe('AccountScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<AccountScreen driverId={driver.id} />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows the driver, their id and their organisation', async () => {
        const t = await mount(<AccountScreen driverId={driver.id} />);
        const text = textOf(t);
        expect(text).toContain('Ron');
        expect(text).toContain('FP138717');
        expect(text).toContain('Fleetbase Pte Ltd');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('names the assigned vehicle', async () => {
        const t = await mount(<AccountScreen driverId={driver.id} />);
        expect(textOf(t)).toContain('EAS-01');
        expect(testIDs(t)).not.toContain('no-vehicle');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says so when no vehicle is assigned, rather than showing a blank', async () => {
        mockApi({ ...driver, vehicle: null });
        const t = await mount(<AccountScreen driverId={driver.id} />);
        expect(testIDs(t)).toContain('no-vehicle');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('omits the licence card when the fields are null', async () => {
        // They are null on the instance; an empty card would imply otherwise.
        const t = await mount(<AccountScreen driverId={driver.id} />);
        expect(testIDs(t)).not.toContain('account-licence');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows the licence when there is one', async () => {
        mockApi({ ...driver, drivers_license_number: 'S1234567A', license_expiry: '2028-01-15' });
        const t = await mount(<AccountScreen driverId={driver.id} />);
        expect(testIDs(t)).toContain('account-licence');
        expect(textOf(t)).toContain('S1234567A');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('marks earnings as not enabled until the organisation switches it on (correction 5)', async () => {
        // Off by default: the row is there, honestly gated, never a plausible zero.
        const off = await mount(<AccountScreen driverId={driver.id} />);
        const rows = off.root.findAll((n) => n.props?.testID === 'link-Earnings');
        expect(rows.length).toBeGreaterThan(0);
        expect(textOf(off)).toContain('Not enabled');
        ReactTestRenderer.act(() => off.unmount());

        const on = await mount(<AccountScreen driverId={driver.id} features={{ earnings: true }} />);
        const text = textOf(on);
        expect(text).toContain('Earnings');
        // Only the documents row still carries the mark.
        expect(text.split('Not enabled').length - 1).toBe(1);
        ReactTestRenderer.act(() => on.unmount());
    });

    it('links to everything filed under Account, marking what is not built', async () => {
        const t = await mount(<AccountScreen driverId={driver.id} onNavigate={jest.fn()} />);
        const ids = testIDs(t);
        for (const route of ['FuelLog', 'Issues', 'Settings', 'MyVehicle']) {
            expect(ids).toContain(`link-${route}`);
        }
        expect(textOf(t)).toContain('Coming soon');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('navigates when a link is tapped', async () => {
        const onNavigate = jest.fn();
        const t = await mount(<AccountScreen driverId={driver.id} onNavigate={onNavigate} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'link-FuelLog').props as { onPress?: () => void }).onPress?.();
        });
        expect(onNavigate).toHaveBeenCalledWith('FuelLog');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('confirms before signing out, rather than doing it on one tap', async () => {
        const onSignOut = jest.fn();
        const t = await mount(<AccountScreen driverId={driver.id} onSignOut={onSignOut} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'sign-out').props as { onPress?: () => void }).onPress?.();
        });
        expect(onSignOut).not.toHaveBeenCalled();
        const ids = testIDs(t);
        expect(ids).toContain('sign-out-confirm');
        // The confirmation takes the button's place; leaving both on screen put
        // the confirmation below the fold, where the tap looked like a no-op.
        expect(ids).not.toContain('sign-out');

        await ReactTestRenderer.act(async () => {
            (byID(t, 'sign-out-confirm-yes').props as { onPress?: () => void }).onPress?.();
        });
        expect(onSignOut).toHaveBeenCalled();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('names how much unsynced work signing out would strand', async () => {
        /*
         * Gap spec H4. The token goes, the queue stays, and queued work can
         * only be sent by the driver who made it — so the count is the whole
         * point of the warning.
         *
         * Enqueued after mount deliberately: the provider flushes on mount, and
         * with fetch mocked to succeed anything queued beforehand is sent and
         * gone before the screen ever renders. This also exercises the live
         * subscription rather than the first snapshot.
         */
        const t = await mount(<AccountScreen driverId={driver.id} onSignOut={jest.fn()} />);
        await ReactTestRenderer.act(async () => {
            queue.enqueue({ method: 'POST', path: 'issues', label: 'Report an issue' });
            queue.enqueue({ method: 'POST', path: 'fuel-reports', label: 'Log a fill' });
        });
        await ReactTestRenderer.act(async () => {
            (byID(t, 'sign-out').props as { onPress?: () => void }).onPress?.();
        });
        expect(textOf(t)).toContain('2 things');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says nothing about queued work when there is none', async () => {
        const t = await mount(<AccountScreen driverId={driver.id} onSignOut={jest.fn()} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'sign-out').props as { onPress?: () => void }).onPress?.();
        });
        const text = textOf(t);
        expect(text).toContain('Sign out?');
        expect(text).not.toMatch(/have not reached dispatch/);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('still renders when the organisation lookup fails', async () => {
        // Supporting detail — it must not take the screen down.
        mockApi(driver, 'fail');
        const t = await mount(<AccountScreen driverId={driver.id} />);
        expect(testIDs(t)).toContain('account-screen');
        expect(textOf(t)).toContain('Ron');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers a retry when the driver itself cannot be loaded', async () => {
        mockApi('fail');
        const t = await mount(<AccountScreen driverId={driver.id} />);
        expect(testIDs(t)).toContain('account-error');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('keeps sign out and every local link reachable when the server fails', async () => {
        /*
         * A driver reaches for settings, the sync queue and sign out precisely
         * when the server is misbehaving. None of them need the driver record,
         * and the screen used to replace all of them with one error state.
         */
        mockApi('fail');
        const onNavigate = jest.fn();
        const onSignOut = jest.fn();
        const t = await mount(<AccountScreen driverId={driver.id} onNavigate={onNavigate} onSignOut={onSignOut} />);
        const ids = testIDs(t);
        expect(ids).toContain('account-error');
        expect(ids).toContain('account-links');
        expect(ids).toContain('sign-out');
        expect(ids).toContain('link-SyncQueue');
        // …and the driver's own details, which genuinely are unavailable, stay hidden.
        expect(ids).not.toContain('account-identity');
        ReactTestRenderer.act(() => t.unmount());
    });
});
