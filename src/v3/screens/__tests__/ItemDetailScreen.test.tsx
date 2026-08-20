import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { ItemDetailScreen } from '../ItemDetailScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';
import type { EntityRecord } from '../../data';

/**
 * Shaped from a real `GET /v1/entities` response: `id` is null, identity is in
 * `internal_id`, and most metadata is absent.
 */
const sparse: EntityRecord = {
    id: null,
    internal_id: 'product_jFpaNGYwZG',
    name: 'Orchard Fruit Box',
    type: 'storefront_product',
    tracking_number: null,
    weight: null,
    weight_unit: null,
    length: null,
    width: null,
    height: null,
    price: '2850',
    currency: 'USD',
    destination: 'place_58glfR5Qb9',
};

const full: EntityRecord = {
    ...sparse,
    sku: 'RX-CC-12',
    weight: '2.4',
    weight_unit: 'kg',
    length: '40',
    width: '30',
    height: '25',
    dimensions_unit: 'cm',
    declared_value: '8400',
    description: 'Keep upright. Cold chain.',
    photo_url: 'https://example.test/box.png',
    customer: { name: 'Ava Chen' },
    tracking_number: {
        id: 'track_ENT1',
        tracking_number: 'ENT-000004471-A',
        status: 'Order Dispatched',
        barcode: 'iVBORw0KGgoAAAANS',
        qr_code: 'iVBORw0KGgoAAAANS',
    },
};

const scanRows = [
    { id: 'status_a', status: 'Order Created', details: 'New order created.', code: 'CREATED', city: 'Singapore', created_at: '2026-06-04T15:48:06.000000Z' },
    { id: 'status_b', status: 'Order Dispatched', details: 'Driver assigned.', code: 'DISPATCHED', created_at: '2026-06-05T09:10:00.000000Z' },
];

let fetchMock: jest.Mock;
let queue: MutationQueue;

function ok(body: unknown) {
    return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) });
}

function mockApi({ entity, history }: { entity?: unknown; history?: unknown } = {}) {
    fetchMock.mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('tracking-statuses')) {
            if (history === 'fail') return Promise.reject(new TypeError('Network request failed'));
            return ok(history ?? scanRows);
        }
        if (u.includes('entities/')) {
            if (entity === 'fail') return Promise.reject(new TypeError('Network request failed'));
            return ok(entity ?? full);
        }
        return ok({});
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

async function render(
    scheme: SchemeName = 'dark',
    props: { entityId?: string; entity?: EntityRecord | null; onEdit?: (e: { id: string; name?: string }) => void } = {}
) {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider>
                        <FleetbaseProvider host="https://x.test" queue={queue}>
                            <ItemDetailScreen entityId="product_jFpaNGYwZG" entity={sparse} {...props} />
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
describe('ItemDetailScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await render(scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('renders price from minor units, not the raw value', async () => {
        const t = await render();
        // "2850" USD is $28.50 — showing 2,850 would be 100x wrong.
        expect(textOf(t)).toContain('$28.50');
        expect(textOf(t)).not.toContain('2,850');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows the tracking number in full, never truncated', async () => {
        const t = await render();
        expect(textOf(t)).toContain('ENT-000004471-A');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('omits metadata rows that have no value rather than printing dashes', async () => {
        // Fetch returns the same sparse record the payload carried.
        mockApi({ entity: sparse, history: [] });
        const t = await render();
        const ids = testIDs(t);
        expect(ids).toContain('meta-price');
        expect(ids).not.toContain('meta-weight');
        expect(ids).not.toContain('meta-dimensions');
        expect(ids).not.toContain('meta-sku');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('renders the barcode and QR as data URIs — the API sends bare base64', async () => {
        const t = await render();
        const uris: string[] = [];
        walk(t.toJSON(), (n) => {
            const src = n.props?.source as { uri?: string } | undefined;
            if (src?.uri) uris.push(src.uri);
        });
        expect(uris.some((u) => u.startsWith('data:image/png;base64,iVBOR'))).toBe(true);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows the damaged state when the flag is on meta', async () => {
        mockApi({ entity: { ...full, meta: { damaged: true } } });
        const t = await render();
        const ids = testIDs(t);
        expect(ids).toContain('item-damaged');
        expect(ids).toContain('damaged-pill');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('is not damaged by default', async () => {
        const t = await render();
        expect(testIDs(t)).not.toContain('item-damaged');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('lists scan history newest first', async () => {
        const t = await render();
        const text = textOf(t);
        expect(text).toContain('Driver assigned.');
        expect(text.indexOf('Driver assigned.')).toBeLessThan(text.indexOf('New order created.'));
        ReactTestRenderer.act(() => t.unmount());
    });

    it('explains an item with no tracking number instead of erroring', async () => {
        mockApi({ entity: sparse, history: [] });
        const t = await render();
        expect(testIDs(t)).toContain('history-empty');
        expect(textOf(t)).toContain('no tracking number');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('keeps the item usable when only the history fails', async () => {
        mockApi({ entity: full, history: 'fail' });
        const t = await render();
        const ids = testIDs(t);
        expect(ids).toContain('history-error');
        // The item itself still renders — history is supporting detail.
        expect(ids).toContain('item-meta');
        expect(textOf(t)).toContain('ENT-000004471-A');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('falls back to the payload copy when the fetch fails', async () => {
        mockApi({ entity: 'fail' });
        const t = await render();
        expect(testIDs(t)).not.toContain('item-detail-error');
        expect(textOf(t)).toContain('Orchard Fruit Box');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows a retryable error only when there is no payload copy to fall back on', async () => {
        mockApi({ entity: 'fail' });
        const t = await render('dark', { entity: null });
        expect(testIDs(t)).toContain('item-detail-error');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers edit using internal_id, since live entities have a null id', async () => {
        const onEdit = jest.fn();
        const t = await render('dark', { onEdit });
        const button = t.root.findAll((n) => n.props?.testID === 'item-edit')[0];
        expect(button).toBeTruthy();
        await ReactTestRenderer.act(async () => {
            (button.props as { onPress?: () => void }).onPress?.();
        });
        expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'product_jFpaNGYwZG' }));
        ReactTestRenderer.act(() => t.unmount());
    });

    it('requests the entity by its resolved id, never "null"', async () => {
        await render();
        const urls = fetchMock.mock.calls.map((c) => String(c[0]));
        expect(urls.some((u) => u.includes('entities/product_jFpaNGYwZG'))).toBe(true);
        expect(urls.some((u) => u.includes('entities/null'))).toBe(false);
    });
});
