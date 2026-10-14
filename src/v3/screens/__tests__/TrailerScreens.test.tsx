/**
 * Trailers on My vehicle, and the trailer read view — no design frame exists,
 * so these assert the written spec (docs/redesign/09-TRAILERS-SPEC.md):
 * towing order, identifiers in full, reefer range, and honest empty states.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { MyVehicleScreen } from '../MyVehicleScreen';
import { TrailerDetailScreen } from '../TrailerDetailScreen';
import { NotEnabledScreen } from '../NotEnabledScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { sortByPosition, reeferRangeOf, trainPositionOf, type TrailerRecord } from '../../data/useTrailers';

const vehicle = { id: 'vehicle_1', name: 'CEN-01', plate_number: 'GBB-1001', status: 'available' };

const fridge: TrailerRecord = {
    id: 'trailer_fridge',
    name: 'Fridge box',
    code: 'T-204',
    type: 'reefer',
    body_type: 'box',
    status: 'active',
    attachment_state: 'attached',
    plate_number: 'WD68 KXR',
    vin: 'SB1ZS3JE60E123456',
    refrigerated: true,
    temperature_min: 2,
    temperature_max: 8,
    reefer_engine_hours: 1204,
    axle_count: 3,
    tire_count: 12,
    abs_equipped: true,
    length: 13.6,
    tare_weight: 7200,
    gvwr: 39000,
    measurement_system: 'metric',
    online: true,
    last_online_at: '2026-09-09T06:10:00Z',
    current_vehicle_name: 'CEN-01',
    current_connection: { position: 2, connected_at: '2026-09-09T05:40:00Z', active: true },
};
const flatbed: TrailerRecord = {
    id: 'trailer_flat',
    name: 'Flatbed',
    attachment_state: 'attached',
    plate_number: 'WD68 KXS',
    current_connection: { position: 1, connected_at: '2026-09-09T05:38:00Z', active: true },
};

let fetchMock: jest.Mock;

function mockApi(handlers: Record<string, unknown>) {
    fetchMock.mockImplementation((url: string) => {
        const u = String(url);
        const key = Object.keys(handlers).find((k) => u.includes(k));
        const body = key ? handlers[key] : vehicle;
        if (body === 'fail') return Promise.reject(new TypeError('Network request failed'));
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) });
    });
}

beforeEach(() => {
    clearV3();
    fetchMock = jest.fn();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    mockApi({ '/trailers': [fridge, flatbed] });
});

async function mount(node: React.ReactNode, scheme: SchemeName = 'dark') {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider>
                        <FleetbaseProvider host="https://x.test" queue={new MutationQueue()}>
                            {node}
                        </FleetbaseProvider>
                    </SyncProvider>
                </Theme>
            </TamaguiProvider>
        );
        await Promise.resolve();
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
const unmount = (t: ReactTestRenderer.ReactTestRenderer) => ReactTestRenderer.act(() => t.unmount());

describe('trailer helpers', () => {
    it('orders the train by position, unpositioned last', () => {
        const out = sortByPosition([{ id: 'x', name: 'Loose' }, fridge, flatbed]);
        expect(out.map((t) => t.id)).toEqual(['trailer_flat', 'trailer_fridge', 'x']);
    });

    it('reads the reefer range only for refrigerated units', () => {
        expect(reeferRangeOf(fridge)).toBe('2–8 °C');
        expect(reeferRangeOf(flatbed)).toBeUndefined();
        expect(reeferRangeOf({ id: 'y', refrigerated: true, temperature_max: -18 })).toBe('-18 °C');
        expect(trainPositionOf(fridge)).toBe(2);
        expect(trainPositionOf({ id: 'z' })).toBeUndefined();
    });
});

describe('MyVehicleScreen — attached trailers', () => {
    it('lists the train in towing order with plates in full and the reefer range', async () => {
        const onOpenTrailer = jest.fn();
        const t = await mount(<MyVehicleScreen vehicleId="vehicle_1" onOpenTrailer={onOpenTrailer} />);
        const ids = testIDs(t);
        const flat = ids.indexOf('vehicle-trailer-trailer_flat');
        const cold = ids.indexOf('vehicle-trailer-trailer_fridge');
        expect(flat).toBeGreaterThan(-1);
        expect(cold).toBeGreaterThan(flat);
        const text = textOf(t);
        expect(text).toContain('WD68 KXR');
        expect(text).toContain('WD68 KXS');
        expect(text).toContain('2–8 °C');
        expect(ids).toContain('vehicle-trailer-reefer-trailer_fridge');
        const row = t.root.findAll((n) => n.props?.testID === 'vehicle-trailer-trailer_fridge' && typeof n.props?.onPress === 'function')[0];
        await ReactTestRenderer.act(async () => row.props.onPress());
        expect(onOpenTrailer).toHaveBeenCalledWith(expect.objectContaining({ id: 'trailer_fridge' }));
        await unmount(t);
    });

    it('says calmly when nothing is attached', async () => {
        mockApi({ '/trailers': [] });
        const t = await mount(<MyVehicleScreen vehicleId="vehicle_1" />);
        expect(testIDs(t)).toContain('vehicle-trailers-none');
        expect(textOf(t)).toContain('No trailer is attached');
        await unmount(t);
    });

    it('keeps the vehicle readable when the trailer read fails', async () => {
        mockApi({ '/trailers': 'fail' });
        const t = await mount(<MyVehicleScreen vehicleId="vehicle_1" />);
        expect(testIDs(t)).toContain('vehicle-trailers-error');
        expect(textOf(t)).toContain('GBB-1001');
        await unmount(t);
    });
});

describe('TrailerDetailScreen', () => {
    beforeEach(() => mockApi({ '/trailers/trailer_fridge': fridge }));

    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<TrailerDetailScreen trailerId="trailer_fridge" />, scheme);
        expect(testIDs(t)).toContain('trailer-detail');
        await unmount(t);
    });

    it('shows identity, towing, size, gear, reefer and telematics groups with identifiers in full', async () => {
        const t = await mount(<TrailerDetailScreen trailerId="trailer_fridge" seed={fridge} />);
        const ids = testIDs(t);
        for (const g of ['trailer-ids', 'trailer-towing', 'trailer-size', 'trailer-gear', 'trailer-cold', 'trailer-telematics']) expect(ids).toContain(g);
        const text = textOf(t);
        expect(text).toContain('SB1ZS3JE60E123456');
        expect(text).toContain('WD68 KXR');
        expect(text).toContain('2–8 °C');
        expect(text).toContain('13.6 m');
        expect(text).toContain('39,000 kg');
        expect(text).toContain('CEN-01');
        expect(ids).toContain('trailer-read-only');
        await unmount(t);
    });

    it('omits groups with nothing in them rather than drawing blanks', async () => {
        mockApi({ '/trailers/trailer_flat': flatbed });
        const t = await mount(<TrailerDetailScreen trailerId="trailer_flat" seed={flatbed} />);
        const ids = testIDs(t);
        expect(ids).toContain('trailer-ids');
        expect(ids).not.toContain('trailer-cold');
        expect(ids).not.toContain('trailer-size');
        expect(ids).not.toContain('trailer-gear');
        await unmount(t);
    });

    it('fails honestly when the trailer cannot be read', async () => {
        mockApi({ '/trailers/trailer_fridge': 'fail' });
        const t = await mount(<TrailerDetailScreen trailerId="trailer_fridge" />);
        expect(testIDs(t)).toContain('trailer-error');
        await unmount(t);
    });
});

describe('NotEnabledScreen', () => {
    it.each(SCHEMES)('renders the documents state in the %s scheme', async (scheme) => {
        const t = await mount(<NotEnabledScreen feature="documents" />, scheme);
        expect(testIDs(t)).toContain('not-enabled-documents');
        expect(textOf(t)).toContain('Not switched on');
        await unmount(t);
    });

    it('says what each feature is, in the driver’s words, not a build phase', async () => {
        for (const feature of ['documents', 'inspection', 'earnings'] as const) {
            const t = await mount(<NotEnabledScreen feature={feature} />);
            const text = textOf(t);
            expect(text).not.toMatch(/Phase|Blocked on/);
            expect(text).toContain('Ask dispatch');
            await unmount(t);
        }
    });
});
