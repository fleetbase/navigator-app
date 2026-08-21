import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { NavigationHandoffScreen } from '../NavigationHandoffScreen';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';

const SINGAPORE = { latitude: 1.3521, longitude: 103.8198, label: 'Fleetbase Market' };

beforeEach(() => {
    clearV3();
    settingsStore.reset();
});

async function mount(node: React.ReactNode, scheme: SchemeName = 'dark') {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>{node}</Theme>
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
const testIDs = (t: ReactTestRenderer.ReactTestRenderer) => {
    const out: string[] = [];
    walk(t.toJSON(), (n) => typeof n.props?.testID === 'string' && out.push(n.props.testID as string));
    return out;
};
const byID = (t: ReactTestRenderer.ReactTestRenderer, id: string) => t.root.findAll((n) => n.props?.testID === id)[0];

const allInstalled = () => jest.fn().mockResolvedValue(true);
const noneInstalled = () => jest.fn().mockResolvedValue(false);

describe('NavigationHandoffScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<NavigationHandoffScreen destination={SINGAPORE} probe={allInstalled()} />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says there is nowhere to go when the stop has no location', async () => {
        const t = await mount(<NavigationHandoffScreen probe={allInstalled()} />);
        expect(testIDs(t)).toContain('handoff-no-destination');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('marks the remembered default', async () => {
        settingsStore.set('navigationApp', 'waze');
        const t = await mount(<NavigationHandoffScreen destination={SINGAPORE} probe={allInstalled()} />);
        expect(testIDs(t)).toContain('default-waze');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('opens the chosen app with the destination', async () => {
        const open = jest.fn().mockResolvedValue(undefined);
        const t = await mount(<NavigationHandoffScreen destination={SINGAPORE} probe={allInstalled()} open={open} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'go-waze').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        expect(open).toHaveBeenCalledWith(expect.stringContaining('waze://?ll=1.3521,103.8198'));
        ReactTestRenderer.act(() => t.unmount());
    });

    it('remembers the choice by default, so the picker can be skipped next time', async () => {
        const open = jest.fn().mockResolvedValue(undefined);
        const t = await mount(<NavigationHandoffScreen destination={SINGAPORE} probe={allInstalled()} open={open} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'go-google').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        expect(settingsStore.getState().navigationApp).toBe('google');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('leaves the default alone when the driver unticks remember', async () => {
        settingsStore.set('navigationApp', 'apple');
        const open = jest.fn().mockResolvedValue(undefined);
        const t = await mount(<NavigationHandoffScreen destination={SINGAPORE} probe={allInstalled()} open={open} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'remember-toggle').props as { onPress?: () => void }).onPress?.();
        });
        await ReactTestRenderer.act(async () => {
            (byID(t, 'go-waze').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        expect(settingsStore.getState().navigationApp).toBe('apple');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('marks apps that are not installed, rather than hiding them', async () => {
        const probe = jest.fn(async (url: string) => url.startsWith('waze'));
        const t = await mount(<NavigationHandoffScreen destination={SINGAPORE} probe={probe} />);
        const ids = testIDs(t);
        expect(ids).toContain('not-installed-google');
        expect(ids).not.toContain('not-installed-waze');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says so when it had to fall back to the browser', async () => {
        const open = jest.fn().mockResolvedValue(undefined);
        const t = await mount(<NavigationHandoffScreen destination={SINGAPORE} probe={noneInstalled()} open={open} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'go-google').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        expect(testIDs(t)).toContain('handoff-fallback');
        expect(open).toHaveBeenCalledWith(expect.stringContaining('https://'));
        ReactTestRenderer.act(() => t.unmount());
    });

    it('reports when nothing on the phone could open directions', async () => {
        const open = jest.fn().mockRejectedValue(new Error('no handler'));
        const t = await mount(<NavigationHandoffScreen destination={SINGAPORE} probe={noneInstalled()} open={open} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'go-waze').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        expect(testIDs(t)).toContain('handoff-failed');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('closes once an app actually opened', async () => {
        const onDone = jest.fn();
        const open = jest.fn().mockResolvedValue(undefined);
        const t = await mount(<NavigationHandoffScreen destination={SINGAPORE} probe={allInstalled()} open={open} onDone={onDone} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'go-waze').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        expect(onDone).toHaveBeenCalled();
        ReactTestRenderer.act(() => t.unmount());
    });
});
