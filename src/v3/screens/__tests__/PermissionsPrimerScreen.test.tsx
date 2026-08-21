import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { PermissionsPrimerScreen } from '../PermissionsPrimerScreen';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';
import type { PermissionKey, PermissionState } from '../../permissions/permissions';

beforeEach(() => {
    clearV3();
    settingsStore.reset();
});

const checker = (states: Partial<Record<PermissionKey, PermissionState>>) =>
    jest.fn(async (key: PermissionKey) => states[key] ?? 'denied');

async function mount(node: React.ReactNode, scheme: SchemeName = 'dark') {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>{node}</Theme>
            </TamaguiProvider>
        );
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
const byID = (t: ReactTestRenderer.ReactTestRenderer, id: string) => t.root.findAll((n) => n.props?.testID === id)[0];

describe('PermissionsPrimerScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<PermissionsPrimerScreen check={checker({})} />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('explains each permission before the OS ever asks', async () => {
        // The prompt is shown once; the explanation has to come first.
        const t = await mount(<PermissionsPrimerScreen check={checker({})} />);
        const text = textOf(t);
        expect(text).toContain('Dispatch sees where you are');
        expect(text).toContain('proof of delivery');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers Allow for a denied permission, which can be asked again', async () => {
        const t = await mount(<PermissionsPrimerScreen check={checker({ location: 'denied' })} />);
        expect(testIDs(t)).toContain('ask-location');
        expect(testIDs(t)).not.toContain('settings-location');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('sends a blocked permission to Settings instead of asking again', async () => {
        // Asking again does nothing once blocked — the button would look broken.
        const t = await mount(<PermissionsPrimerScreen check={checker({ location: 'blocked' })} />);
        const ids = testIDs(t);
        expect(ids).toContain('settings-location');
        expect(ids).toContain('blocked-location');
        expect(ids).not.toContain('ask-location');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('opens Settings when asked to', async () => {
        const openSettings = jest.fn();
        const t = await mount(<PermissionsPrimerScreen check={checker({ camera: 'blocked' })} openSettings={openSettings} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'settings-camera').props as { onPress?: () => void }).onPress?.();
        });
        expect(openSettings).toHaveBeenCalled();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows nothing to do for a granted permission', async () => {
        const t = await mount(<PermissionsPrimerScreen check={checker({ camera: 'granted' })} />);
        const ids = testIDs(t);
        expect(ids).toContain('granted-camera');
        expect(ids).not.toContain('ask-camera');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('requests and records the new state', async () => {
        const request = jest.fn().mockResolvedValue({ state: 'granted' as PermissionState });
        const t = await mount(<PermissionsPrimerScreen check={checker({ camera: 'denied' })} request={request} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'ask-camera').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        expect(request).toHaveBeenCalledWith('camera');
        expect(testIDs(t)).toContain('granted-camera');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('warns when location was granted only while the app is open', async () => {
        const request = jest.fn().mockResolvedValue({ state: 'granted' as PermissionState, partial: true });
        const t = await mount(<PermissionsPrimerScreen check={checker({ location: 'denied' })} request={request} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'ask-location').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        expect(testIDs(t)).toContain('partial-location');
        expect(textOf(t)).toContain('Tracking will stop when you switch away');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('is satisfied once the essential permissions are granted, camera or not', async () => {
        const t = await mount(
            <PermissionsPrimerScreen check={checker({ location: 'granted', notifications: 'granted', camera: 'denied' })} />
        );
        expect(testIDs(t)).toContain('permissions-satisfied');
        expect(testIDs(t)).toContain('permissions-continue');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('lets the driver proceed without them, saying what will not work', async () => {
        const t = await mount(<PermissionsPrimerScreen check={checker({ location: 'denied' })} />);
        const ids = testIDs(t);
        expect(ids).toContain('permissions-outstanding');
        expect(ids).toContain('permissions-skip');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('treats an unavailable permission as nothing to do', async () => {
        const t = await mount(
            <PermissionsPrimerScreen check={checker({ location: 'granted', notifications: 'unavailable' })} />
        );
        expect(testIDs(t)).toContain('unavailable-notifications');
        expect(testIDs(t)).toContain('permissions-satisfied');
        ReactTestRenderer.act(() => t.unmount());
    });
});
