import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { SelfHostedConnectionScreen } from '../SelfHostedConnectionScreen';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';
import type { ProbeResult } from '../../connection/probeHost';

/** These screens render pre-auth, outside DriverShell, so they read the inset directly. */
const safeAreaMetrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

beforeEach(() => {
    clearV3();
    settingsStore.reset();
});

const prober = (result: ProbeResult) => jest.fn(async () => result);

async function mount(node: React.ReactNode, scheme: SchemeName = 'dark') {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <SafeAreaProvider initialMetrics={safeAreaMetrics}>
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>{node}</Theme>
            </TamaguiProvider>
            </SafeAreaProvider>
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
const press = async (t: ReactTestRenderer.ReactTestRenderer, id: string) =>
    ReactTestRenderer.act(async () => {
        (byID(t, id).props as { onPress?: () => void }).onPress?.();
        await Promise.resolve();
    });

const verified: ProbeResult = { ok: true, identity: { host: 'https://fleetbase.example.com', version: '0.7.53', apiVersion: 'v1' } };

describe('SelfHostedConnectionScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<SelfHostedConnectionScreen probe={prober(verified) as never} />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('never asks for an API key, and says so', async () => {
        // v2 asks for one here, and its deep link ships one automatically.
        const t = await mount(<SelfHostedConnectionScreen probe={prober(verified) as never} />);
        const ids = testIDs(t);
        expect(ids).not.toContain('input-key');
        expect(ids).not.toContain('input-apiKey');
        expect(ids).toContain('no-key-needed');
        expect(textOf(t)).toContain('No API key is needed');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('cannot check an empty address', async () => {
        const t = await mount(<SelfHostedConnectionScreen probe={prober(verified) as never} />);
        expect(byID(t, 'connect-check').props.disabled).toBe(true);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows the instance version once verified', async () => {
        const t = await mount(<SelfHostedConnectionScreen probe={prober(verified) as never} />);
        type(t, 'input-host', 'fleetbase.example.com');
        await press(t, 'connect-check');
        expect(testIDs(t)).toContain('connection-verified');
        expect(textOf(t)).toContain('0.7.53');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('hands the verified host up only after the driver confirms', async () => {
        const onConnected = jest.fn();
        const t = await mount(<SelfHostedConnectionScreen probe={prober(verified) as never} onConnected={onConnected} />);
        type(t, 'input-host', 'fleetbase.example.com');
        await press(t, 'connect-check');
        expect(onConnected).not.toHaveBeenCalled();

        await press(t, 'connect-use');
        expect(onConnected).toHaveBeenCalledWith(verified.ok ? verified.identity : undefined);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('explains an insecure address rather than just failing', async () => {
        const t = await mount(<SelfHostedConnectionScreen probe={prober({ ok: false, reason: 'insecure' }) as never} />);
        type(t, 'input-host', 'http://fleetbase.example.com');
        await press(t, 'connect-check');
        expect(testIDs(t)).toContain('failure-insecure');
        expect(textOf(t)).toContain('sent in the clear');
        ReactTestRenderer.act(() => t.unmount());
    });

    it.each([
        ['invalid-url', 'typo'],
        ['unreachable', 'Nothing answered'],
        ['not-fleetbase', 'not a Fleetbase server'],
    ] as const)('explains the %s failure', async (reason, phrase) => {
        const t = await mount(<SelfHostedConnectionScreen probe={prober({ ok: false, reason }) as never} />);
        type(t, 'input-host', 'something');
        await press(t, 'connect-check');
        expect(testIDs(t)).toContain(`failure-${reason}`);
        expect(textOf(t)).toContain(phrase);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('forgets a previous verdict when the address is edited', async () => {
        // A verified banner left over from another host would be a lie.
        const t = await mount(<SelfHostedConnectionScreen probe={prober(verified) as never} />);
        type(t, 'input-host', 'fleetbase.example.com');
        await press(t, 'connect-check');
        expect(testIDs(t)).toContain('connection-verified');

        type(t, 'input-host', 'other.example.com');
        expect(testIDs(t)).not.toContain('connection-verified');
        expect(testIDs(t)).toContain('connect-check');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says signing in comes next, so the screen does not look like the whole flow', async () => {
        const t = await mount(<SelfHostedConnectionScreen probe={prober(verified) as never} />);
        expect(testIDs(t)).toContain('connect-next');
        ReactTestRenderer.act(() => t.unmount());
    });
});
