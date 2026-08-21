import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { FuelLogScreen } from '../FuelLogScreen';
import { FuelReportScreen } from '../FuelReportScreen';
import { FuelReportCreateScreen } from '../FuelReportCreateScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';
import type { FuelReportRecord } from '../../data';

/** Shaped from a live `GET /v1/fuel-reports` row. */
const older: FuelReportRecord = {
    id: 'fuel_report_a',
    status: 'approved',
    type: null,
    odometer: '25120',
    volume: '42',
    metric_unit: 'l',
    amount: '8450',
    currency: 'SGD',
    location: { type: 'Point', coordinates: [103.8508, 1.282] },
    vehicle: { id: 'v1', name: 'CEN-01' },
    created_at: '2026-01-15T08:00:00.000000Z',
};
const newer: FuelReportRecord = {
    ...older,
    id: 'fuel_report_b',
    status: 'draft',
    odometer: '25620',
    volume: '40',
    amount: '7325',
    created_at: '2026-02-15T08:00:00.000000Z',
};

let fetchMock: jest.Mock;
let queue: MutationQueue;

function mockList(rows: unknown = [newer, older]) {
    fetchMock.mockImplementation(() =>
        rows === 'fail'
            ? Promise.reject(new TypeError('Network request failed'))
            : Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(rows) })
    );
}

beforeEach(() => {
    clearV3();
    settingsStore.reset();
    queue = new MutationQueue();
    fetchMock = jest.fn();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    mockList();
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

describe('FuelLogScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<FuelLogScreen driverId="driver_1" />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('scopes the query with driver=, not driver_uuid', async () => {
        // driver_uuid and driver_assigned are ignored by the API and would
        // return every driver's fuel spend in the company.
        await mount(<FuelLogScreen driverId="driver_1" />);
        const url = String(fetchMock.mock.calls[0]?.[0] ?? '');
        expect(url).toContain('driver=driver_1');
        expect(url).not.toContain('driver_uuid');
        expect(url).not.toContain('driver_assigned');
    });

    it('renders cost from minor units', async () => {
        const t = await mount(<FuelLogScreen driverId="driver_1" />);
        // "7325" SGD is $73.25, not $7,325.
        expect(textOf(t)).toContain('73.25');
        expect(textOf(t)).not.toContain('7,325');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows economy on the later fill and not on the first', async () => {
        const t = await mount(<FuelLogScreen driverId="driver_1" />);
        const ids = testIDs(t);
        expect(ids).toContain('economy-fuel_report_b');
        expect(ids).not.toContain('economy-fuel_report_a');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('refetches when the reload token changes, so a new fill shows on return', async () => {
        // Logging a fill and coming back used to show the list as it was when
        // the tab was first opened.
        let tree!: ReactTestRenderer.ReactTestRenderer;
        await ReactTestRenderer.act(async () => {
            tree = ReactTestRenderer.create(
                <TamaguiProvider config={config} defaultTheme="dark">
                    <Theme name="dark">
                        <SyncProvider>
                            <FleetbaseProvider host="https://x.test" queue={queue}>
                                <FuelLogScreen driverId="driver_1" reloadToken={1} />
                            </FleetbaseProvider>
                        </SyncProvider>
                    </Theme>
                </TamaguiProvider>
            );
            await Promise.resolve();
        });
        const before = fetchMock.mock.calls.length;

        await ReactTestRenderer.act(async () => {
            tree.update(
                <TamaguiProvider config={config} defaultTheme="dark">
                    <Theme name="dark">
                        <SyncProvider>
                            <FleetbaseProvider host="https://x.test" queue={queue}>
                                <FuelLogScreen driverId="driver_1" reloadToken={2} />
                            </FleetbaseProvider>
                        </SyncProvider>
                    </Theme>
                </TamaguiProvider>
            );
            await Promise.resolve();
        });

        expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('is empty, not broken, for a driver with no fills', async () => {
        mockList([]);
        const t = await mount(<FuelLogScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('fuel-empty');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers a retry when the list fails', async () => {
        mockList('fail');
        const t = await mount(<FuelLogScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('fuel-error');
        ReactTestRenderer.act(() => t.unmount());
    });
});

describe('FuelReportScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<FuelReportScreen report={newer} previous={older} />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows economy when there is an earlier fill, and says why when there is not', async () => {
        const withPrev = await mount(<FuelReportScreen report={newer} previous={older} />);
        expect(testIDs(withPrev)).toContain('fuel-row-economy');
        ReactTestRenderer.act(() => withPrev.unmount());

        const without = await mount(<FuelReportScreen report={newer} />);
        expect(testIDs(without)).toContain('fuel-no-economy');
        ReactTestRenderer.act(() => without.unmount());
    });

    it('omits the location row when the point is null island', async () => {
        const t = await mount(<FuelReportScreen report={{ ...newer, location: { type: 'Point', coordinates: [0, 0] } }} />);
        expect(testIDs(t)).not.toContain('fuel-row-location');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says the rejection reason is not available rather than inventing one', async () => {
        const t = await mount(<FuelReportScreen report={{ ...newer, status: 'rejected' }} />);
        expect(testIDs(t)).toContain('fuel-rejected');
        expect(textOf(t)).toContain('not shared with the driver app');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('is honest that fuel-card matching is invisible here', async () => {
        const t = await mount(<FuelReportScreen report={newer} />);
        expect(testIDs(t)).toContain('fuel-card-note');
        ReactTestRenderer.act(() => t.unmount());
    });
});

describe('FuelReportCreateScreen', () => {
    const type = (t: ReactTestRenderer.ReactTestRenderer, id: string, text: string) =>
        ReactTestRenderer.act(() => {
            (byID(t, id).props as { onChangeText?: (s: string) => void }).onChangeText?.(text);
        });

    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<FuelReportCreateScreen driverId="driver_1" />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('cannot save until odometer and volume are both given', async () => {
        const t = await mount(<FuelReportCreateScreen driverId="driver_1" />);
        expect(byID(t, 'create-save').props.disabled).toBe(true);
        type(t, 'input-odometer', '31240');
        expect(byID(t, 'create-save').props.disabled).toBe(true);
        type(t, 'input-volume', '38.5');
        expect(byID(t, 'create-save').props.disabled).toBe(false);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('sends the cost in minor units', async () => {
        const t = await mount(<FuelReportCreateScreen driverId="driver_1" currency="SGD" />);
        type(t, 'input-odometer', '31240');
        type(t, 'input-volume', '38.5');
        type(t, 'input-amount', '73.25');
        await ReactTestRenderer.act(async () => {
            (byID(t, 'create-save').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });

        const post = fetchMock.mock.calls.find((c) => String(c[1]?.method).toUpperCase() === 'POST');
        const body = JSON.parse(String(post?.[1]?.body));
        // $73.25 is stored as 7325.
        expect(body.amount).toBe('7325');
        expect(body.currency).toBe('SGD');
        expect(body.driver).toBe('driver_1');
        expect(body.volume).toBe('38.5');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('omits cost entirely when the driver leaves it blank', async () => {
        const t = await mount(<FuelReportCreateScreen driverId="driver_1" />);
        type(t, 'input-odometer', '31240');
        type(t, 'input-volume', '38.5');
        await ReactTestRenderer.act(async () => {
            (byID(t, 'create-save').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        const post = fetchMock.mock.calls.find((c) => String(c[1]?.method).toUpperCase() === 'POST');
        const body = JSON.parse(String(post?.[1]?.body));
        expect('amount' in body).toBe(false);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('warns when the odometer is below the previous reading', async () => {
        const t = await mount(<FuelReportCreateScreen driverId="driver_1" lastReport={older} />);
        type(t, 'input-odometer', '100');
        ReactTestRenderer.act(() => {
            (byID(t, 'input-odometer').props as { onBlur?: () => void }).onBlur?.();
        });
        expect(textOf(t)).toContain('below your last reading');
        expect(byID(t, 'create-save').props.disabled).toBe(true);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('previews economy before saving, so a typo is visible at the pump', async () => {
        const t = await mount(<FuelReportCreateScreen driverId="driver_1" lastReport={older} />);
        type(t, 'input-odometer', '25620');
        type(t, 'input-volume', '40');
        expect(testIDs(t)).toContain('economy-preview');
        // 500 km on 40 L is 8.0 L/100km.
        expect(textOf(t)).toContain('8.0 L/100km');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('rejects non-numeric input rather than posting it', async () => {
        const t = await mount(<FuelReportCreateScreen driverId="driver_1" />);
        type(t, 'input-volume', '38.5.2');
        ReactTestRenderer.act(() => {
            (byID(t, 'input-volume').props as { onBlur?: () => void }).onBlur?.();
        });
        expect(byID(t, 'create-save').props.disabled).toBe(true);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says which designed fields the server cannot store', async () => {
        const t = await mount(<FuelReportCreateScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('unsupported-note');
        expect(textOf(t)).toContain('Fuel type, station and receipt photos');
        ReactTestRenderer.act(() => t.unmount());
    });
});
