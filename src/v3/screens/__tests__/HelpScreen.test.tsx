/**
 * Help and support — gap spec H3.
 *
 * The interesting assertions here are about restraint: what the screen sends,
 * and what it refuses to pretend it has.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { HelpScreen } from '../HelpScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { describeDiagnostics } from '../../data/diagnostics';

let queue: MutationQueue;
let fetchMock: jest.Mock;

beforeEach(() => {
    clearV3();
    queue = new MutationQueue();
    fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ id: 'issue_1' }),
    });
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
});

async function mount(node: React.ReactNode, scheme: SchemeName = 'dark', sync: { isOnline?: boolean } = {}) {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider isOnline={sync.isOnline ?? true}>
                        <FleetbaseProvider host="https://api.example.test" queue={queue}>
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

const screen = (over: Partial<React.ComponentProps<typeof HelpScreen>> = {}) => (
    <HelpScreen driverId="driver_1" appVersion="3.0.0 (1)" host="https://api.example.test" {...over} />
);

describe('describeDiagnostics', () => {
    it('names the build, the instance and what is still waiting', () => {
        const text = describeDiagnostics({
            appVersion: '3.0.0 (1)',
            platform: 'ios 26.5',
            host: 'https://api.example.test',
            driverId: 'driver_1',
            queued: 2,
            failed: 1,
            online: false,
        });
        expect(text).toContain('3.0.0 (1)');
        expect(text).toContain('https://api.example.test');
        expect(text).toContain('offline');
        expect(text).toContain('Queued: 2, failed: 1');
    });

    it('leaves out what it does not have rather than printing empty labels', () => {
        const text = describeDiagnostics({ appVersion: '3.0.0', platform: 'ios', queued: 0, failed: 0, online: true });
        expect(text).not.toContain('Server:');
        expect(text).not.toContain('Driver:');
    });
});

describe('HelpScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(screen(), scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says the FAQ is not available rather than showing an empty list', async () => {
        const t = await mount(screen());
        expect(textOf(t)).toContain('Not available yet');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('hands off to the Inbox for contacting dispatch', async () => {
        const onMessageDispatch = jest.fn();
        const t = await mount(screen({ onMessageDispatch }));
        await ReactTestRenderer.act(async () => {
            (byID(t, 'help-message-dispatch').props as { onPress?: () => void }).onPress?.();
        });
        expect(onMessageDispatch).toHaveBeenCalled();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows the driver exactly what will be attached, before they send it', async () => {
        const t = await mount(screen());
        const shown = textOf(t);
        expect(testIDs(t)).toContain('help-diagnostics-summary');
        expect(shown).toContain('3.0.0 (1)');
        expect(shown).toContain('https://api.example.test');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('will not send an empty report', async () => {
        const t = await mount(screen());
        const send = byID(t, 'help-send');
        expect((send.props as { disabled?: boolean }).disabled).toBe(true);
        ReactTestRenderer.act(() => t.unmount());
    });

    it("files it under the organisation's own bug taxonomy, with the diagnostics in the body", async () => {
        const t = await mount(screen());
        await ReactTestRenderer.act(async () => {
            (byID(t, 'help-report').props as { onChangeText?: (v: string) => void }).onChangeText?.('The order screen went blank');
        });
        await ReactTestRenderer.act(async () => {
            (byID(t, 'help-send').props as { onPress?: () => void }).onPress?.();
        });

        const call = fetchMock.mock.calls.find(([url]) => String(url).includes('issues'));
        expect(call).toBeTruthy();
        const body = JSON.parse((call?.[1] as { body: string }).body);
        // The hook normalises display terms to the API's own snake_case, the
        // same path every driver-filed issue takes.
        expect(body.type).toBe('software_technical');
        expect(body.category).toBe('bugs');
        expect(body.report).toContain('The order screen went blank');
        // The diagnostics ride in the body because the public issues API has
        // nowhere else to put them.
        expect(body.report).toContain('3.0.0 (1)');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says it was saved on the device when there is no signal', async () => {
        fetchMock.mockRejectedValue(new TypeError('Network request failed'));
        const t = await mount(screen(), 'dark', { isOnline: false });
        await ReactTestRenderer.act(async () => {
            (byID(t, 'help-report').props as { onChangeText?: (v: string) => void }).onChangeText?.('Broken offline too');
        });
        await ReactTestRenderer.act(async () => {
            (byID(t, 'help-send').props as { onPress?: () => void }).onPress?.();
        });
        expect(testIDs(t)).toContain('help-queued');
        ReactTestRenderer.act(() => t.unmount());
    });
});
