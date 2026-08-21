import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { OrgSwitcherScreen } from '../OrgSwitcherScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';

const CURRENT = 'company_hfUOJNWBuO';
const orgs = [
    { id: CURRENT, name: 'Fleetbase Pte Ltd', currency: 'SGD' },
    { id: 'company_kecfekzufc', name: 'Delaney Haulage Group', currency: 'GBP' },
];

let fetchMock: jest.Mock;
let queue: MutationQueue;

function mockApi(list: unknown = orgs, switchResult: unknown = { driver: { id: 'driver_new', token: 't' } }) {
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
        if (String(init?.method).toUpperCase() === 'POST') {
            if (switchResult === 'fail') return Promise.reject(new TypeError('Network request failed'));
            return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(switchResult) });
        }
        if (list === 'fail') return Promise.reject(new TypeError('Network request failed'));
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(list) });
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

describe('OrgSwitcherScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<OrgSwitcherScreen driverId="driver_1" currentOrganizationId={CURRENT} />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('asks the driver-scoped endpoint, not the platform-gated one', async () => {
        // GET /v1/organizations needs a platform token and 401s for a driver.
        await mount(<OrgSwitcherScreen driverId="driver_1" />);
        const url = String(fetchMock.mock.calls[0]?.[0] ?? '');
        expect(url).toContain('drivers/driver_1/organizations');
    });

    it('marks the current organisation and offers no switch for it', async () => {
        const t = await mount(<OrgSwitcherScreen driverId="driver_1" currentOrganizationId={CURRENT} />);
        const ids = testIDs(t);
        expect(ids).toContain(`current-${CURRENT}`);
        expect(ids).not.toContain(`switch-${CURRENT}`);
        expect(ids).toContain('switch-company_kecfekzufc');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says one organisation is not a choice', async () => {
        mockApi([orgs[0]]);
        const t = await mount(<OrgSwitcherScreen driverId="driver_1" currentOrganizationId={CURRENT} />);
        expect(testIDs(t)).toContain('single-org');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('sends `next`, which is the only parameter the API accepts', async () => {
        const t = await mount(<OrgSwitcherScreen driverId="driver_1" currentOrganizationId={CURRENT} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'switch-company_kecfekzufc').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        const post = fetchMock.mock.calls.find((c) => String(c[1]?.method).toUpperCase() === 'POST');
        expect(String(post?.[0])).toContain('switch-organization');
        expect(JSON.parse(String(post?.[1]?.body))).toEqual({ next: 'company_kecfekzufc' });
        ReactTestRenderer.act(() => t.unmount());
    });

    it('hands the new driver up rather than creating the session itself', async () => {
        const onSwitched = jest.fn();
        const t = await mount(<OrgSwitcherScreen driverId="driver_1" currentOrganizationId={CURRENT} onSwitched={onSwitched} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'switch-company_kecfekzufc').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        expect(onSwitched).toHaveBeenCalledWith(expect.objectContaining({ id: 'driver_new' }));
        ReactTestRenderer.act(() => t.unmount());
    });

    it('accepts a bare driver as well as one wrapped in { driver }', async () => {
        mockApi(orgs, { id: 'driver_bare' });
        const onSwitched = jest.fn();
        const t = await mount(<OrgSwitcherScreen driverId="driver_1" currentOrganizationId={CURRENT} onSwitched={onSwitched} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'switch-company_kecfekzufc').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        expect(onSwitched).toHaveBeenCalledWith(expect.objectContaining({ id: 'driver_bare' }));
        ReactTestRenderer.act(() => t.unmount());
    });

    it('reports a failed switch instead of swallowing it', async () => {
        // v2's switchOrganization console.warns and the driver never learns.
        mockApi(orgs, 'fail');
        const onSwitched = jest.fn();
        const t = await mount(<OrgSwitcherScreen driverId="driver_1" currentOrganizationId={CURRENT} onSwitched={onSwitched} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'switch-company_kecfekzufc').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        expect(testIDs(t)).toContain('switch-error');
        expect(onSwitched).not.toHaveBeenCalled();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('warns that switching signs the driver in again', async () => {
        const t = await mount(<OrgSwitcherScreen driverId="driver_1" currentOrganizationId={CURRENT} />);
        expect(textOf(t)).toContain('signs you in again');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers a retry when the list fails', async () => {
        mockApi('fail');
        const t = await mount(<OrgSwitcherScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('orgs-error');
        ReactTestRenderer.act(() => t.unmount());
    });
});
