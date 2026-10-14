import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { EditPayloadItemScreen } from '../EditPayloadItemScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';

const entity = {
    id: 'entity_1',
    name: 'Rx cold-chain box',
    tracking_number: 'ENT-000004471-A',
    sku: 'RX-CC-12',
    quantity: 1,
    weight: '2.4 kg',
    dimensions: '40 × 30 × 25 cm',
    declared_value: '84.00',
    serial_number: 'SN-000099031-XK',
};

let fetchMock: jest.Mock;
let queue: MutationQueue;

function mockAllowlist(fields: string[] | null, configName?: string) {
    fetchMock.mockImplementation((url: string) => {
        if (String(url).includes('editable-entity-fields')) {
            if (fields === null) return Promise.reject(new TypeError('Network request failed'));
            return Promise.resolve({
                ok: true, status: 200, statusText: 'OK',
                json: () => Promise.resolve({ fields, config_name: configName }),
            });
        }
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve({}) });
    });
}

beforeEach(() => {
    clearV3();
    settingsStore.reset();
    queue = new MutationQueue();
    fetchMock = jest.fn();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    mockAllowlist(['quantity', 'weight', 'description']);
});

async function render(scheme: SchemeName = 'dark', onDone?: () => void) {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider>
                        <FleetbaseProvider host="https://x.test" queue={queue}>
                            <EditPayloadItemScreen orderId="order_1" entity={entity} onDone={onDone} />
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

describe('EditPayloadItemScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await render(scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('only makes server-allowed fields editable', async () => {
        const t = await render();
        const ids = testIDs(t);
        // Allowed
        expect(ids).toContain('input-quantity');
        expect(ids).toContain('input-weight');
        // Not allowed — rendered, but read-only
        expect(ids).not.toContain('input-serial_number');
        expect(ids).not.toContain('input-declared_value');
        expect(ids).toContain('field-serial_number');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('still shows locked values — a driver reads what they cannot change', async () => {
        const t = await render();
        expect(textOf(t)).toContain('SN-000099031-XK');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('names the config that locked the rest', async () => {
        mockAllowlist(['quantity'], 'pharmacy-cold-chain');
        const t = await render();
        expect(textOf(t)).toContain('pharmacy-cold-chain');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('locks everything when the allowlist cannot be loaded — never assumes permissive', async () => {
        mockAllowlist(null);
        const t = await render();
        const ids = testIDs(t);
        expect(ids).toContain('permissions-unavailable');
        expect(ids.filter((i) => i.startsWith('input-'))).toHaveLength(0);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says so plainly when nothing is editable', async () => {
        mockAllowlist([]);
        const t = await render();
        expect(testIDs(t)).toContain('nothing-editable');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('sends only allowed fields, never the whole entity', async () => {
        const t = await render();
        const input = t.root.findAll((n) => n.props?.testID === 'input-quantity')[0];
        await ReactTestRenderer.act(async () => {
            (input.props as { onChangeText?: (s: string) => void }).onChangeText?.('3');
        });
        const save = t.root.findAll((n) => n.props?.testID === 'save-edit')[0];
        await ReactTestRenderer.act(async () => {
            (save.props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });

        const put = fetchMock.mock.calls.find((c) => String(c[0]).includes('entities/entity_1'));
        expect(put).toBeTruthy();
        const body = JSON.parse((put![1] as { body: string }).body);
        expect(body).toEqual({ quantity: '3' });
        ReactTestRenderer.act(() => t.unmount());
    });

    it('queues the save offline rather than losing the edit', async () => {
        const t = await render();
        const input = t.root.findAll((n) => n.props?.testID === 'input-weight')[0];
        await ReactTestRenderer.act(async () => {
            (input.props as { onChangeText?: (s: string) => void }).onChangeText?.('3.1 kg');
        });

        fetchMock.mockRejectedValue(new TypeError('Network request failed'));
        const save = t.root.findAll((n) => n.props?.testID === 'save-edit')[0];
        await ReactTestRenderer.act(async () => {
            (save.props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });

        expect(testIDs(t)).toContain('save-queued');
        expect(queue.snapshot().pendingCount).toBe(1);
        ReactTestRenderer.act(() => t.unmount());
    });
});
