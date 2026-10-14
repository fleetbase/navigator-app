import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { ProfileEditScreen } from '../ProfileEditScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';
import type { DriverRecord } from '../../data';

const driver: DriverRecord = {
    id: 'driver_qT49LFY3yn',
    name: 'Ron',
    email: 'ron@fleetbase.io',
    phone: '+19809341969',
    city: 'Singapore',
    country: 'SG',
    status: 'available',
};

let fetchMock: jest.Mock;
let queue: MutationQueue;

function mockApi(result: unknown = { ...driver, name: 'Ronald' }) {
    fetchMock.mockImplementation(() =>
        result === 'fail'
            ? Promise.reject(new TypeError('Network request failed'))
            : Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(result) })
    );
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
const type = (t: ReactTestRenderer.ReactTestRenderer, id: string, text: string) =>
    ReactTestRenderer.act(() => {
        (byID(t, id).props as { onChangeText?: (s: string) => void }).onChangeText?.(text);
    });
const blur = (t: ReactTestRenderer.ReactTestRenderer, id: string) =>
    ReactTestRenderer.act(() => {
        (byID(t, id).props as { onBlur?: () => void }).onBlur?.();
    });

describe('ProfileEditScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<ProfileEditScreen driverId={driver.id} driver={driver} />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers only the driver\'s own details, never dispatch-owned fields', async () => {
        // status / vehicle / vendor / job are writable on the same endpoint and
        // all belong to dispatch.
        const t = await mount(<ProfileEditScreen driverId={driver.id} driver={driver} />);
        const ids = testIDs(t);
        expect(ids).toContain('input-name');
        expect(ids).toContain('input-phone');
        for (const forbidden of ['input-status', 'input-vehicle', 'input-vendor', 'input-job']) {
            expect(ids).not.toContain(forbidden);
        }
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers no password change, and says why', async () => {
        // The endpoint sets a password without checking the current one.
        const t = await mount(<ProfileEditScreen driverId={driver.id} driver={driver} />);
        expect(testIDs(t)).not.toContain('input-password');
        expect(testIDs(t)).toContain('no-password');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('cannot save an unchanged form', async () => {
        const t = await mount(<ProfileEditScreen driverId={driver.id} driver={driver} />);
        expect(byID(t, 'profile-save').props.disabled).toBe(true);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('sends only the fields that actually changed', async () => {
        const t = await mount(<ProfileEditScreen driverId={driver.id} driver={driver} />);
        type(t, 'input-city', 'Johor Bahru');
        await ReactTestRenderer.act(async () => {
            (byID(t, 'profile-save').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        const put = fetchMock.mock.calls.find((c) => String(c[1]?.method).toUpperCase() === 'PUT');
        expect(JSON.parse(String(put?.[1]?.body))).toEqual({ city: 'Johor Bahru' });
        ReactTestRenderer.act(() => t.unmount());
    });

    it('rejects a malformed email rather than letting the server 422', async () => {
        const t = await mount(<ProfileEditScreen driverId={driver.id} driver={driver} />);
        type(t, 'input-email', 'ron@');
        blur(t, 'input-email');
        expect(byID(t, 'profile-save').props.disabled).toBe(true);
        expect(textOf(t)).toContain('does not look like an email');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('enforces the two-letter country code the server validates', async () => {
        const t = await mount(<ProfileEditScreen driverId={driver.id} driver={driver} />);
        type(t, 'input-country', 'SGP');
        blur(t, 'input-country');
        expect(byID(t, 'profile-save').props.disabled).toBe(true);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('will not let the driver blank their own name', async () => {
        const t = await mount(<ProfileEditScreen driverId={driver.id} driver={driver} />);
        type(t, 'input-name', '  ');
        blur(t, 'input-name');
        expect(byID(t, 'profile-save').props.disabled).toBe(true);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('hands the updated driver back when it saves', async () => {
        const onSaved = jest.fn();
        const t = await mount(<ProfileEditScreen driverId={driver.id} driver={driver} onSaved={onSaved} />);
        type(t, 'input-name', 'Ronald');
        await ReactTestRenderer.act(async () => {
            (byID(t, 'profile-save').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ronald' }));
        ReactTestRenderer.act(() => t.unmount());
    });

    it('queues an edit made offline — replaying it later is still what was meant', async () => {
        mockApi('fail');
        const t = await mount(<ProfileEditScreen driverId={driver.id} driver={driver} />);
        type(t, 'input-city', 'Kuala Lumpur');
        await ReactTestRenderer.act(async () => {
            (byID(t, 'profile-save').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        expect(testIDs(t)).toContain('profile-queued');
        expect(queue.snapshot().pendingCount).toBe(1);
        ReactTestRenderer.act(() => t.unmount());
    });
});
