import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { SignInScreen } from '../SignInScreen';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';

/** These screens render pre-auth, outside DriverShell, so they read the inset directly. */
const safeAreaMetrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

beforeEach(() => { clearV3(); settingsStore.reset(); });

function render(props: Partial<React.ComponentProps<typeof SignInScreen>> = {}, isOnline = true) {
    const onSignIn = props.onSignIn ?? jest.fn().mockResolvedValue(undefined);
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <SafeAreaProvider initialMetrics={safeAreaMetrics}>
                <TamaguiProvider config={config} defaultTheme={(props as { scheme?: SchemeName }).scheme ?? 'dark'}>
                    <Theme name="dark">
                        <SyncProvider isOnline={isOnline}>
                            <SignInScreen {...props} onSignIn={onSignIn} />
                        </SyncProvider>
                    </Theme>
                </TamaguiProvider>
            </SafeAreaProvider>
        );
    });
    // @ts-expect-error assigned inside act
    return { tree, onSignIn };
}

type N = { children?: unknown[]; props?: Record<string, unknown> };
function walk(n: unknown, v: (x: N) => void): void {
    if (!n || typeof n === 'string') return;
    if (Array.isArray(n)) return n.forEach((c) => walk(c, v));
    v(n as N);
    (n as N).children?.forEach((c) => walk(c, v));
}
const textOf = (t: ReactTestRenderer.ReactTestRenderer) => {
    const o: string[] = [];
    walk(t.toJSON(), (n) => n.children?.forEach((c) => typeof c === 'string' && o.push(c)));
    return o.join(' ');
};
const testIDs = (t: ReactTestRenderer.ReactTestRenderer) => {
    const o: string[] = [];
    walk(t.toJSON(), (n) => typeof n.props?.testID === 'string' && o.push(n.props.testID as string));
    return o;
};
const find = (t: ReactTestRenderer.ReactTestRenderer, id: string) => t.root.findAll((n) => n.props?.testID === id)[0];

describe('SignInScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', (scheme) => {
        const { tree } = render({ scheme } as never);
        expect(tree.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('masks the password', () => {
        const { tree } = render();
        const field = find(tree, 'sign-in-password');
        expect(JSON.stringify(field.props)).toContain('secure');
        ReactTestRenderer.act(() => tree.unmount());
    });

    // The frame is annotated "renders 1, 2 or 4 of them".
    it.each([
        [[] as const, 0],
        [['phone'] as const, 1],
        [['phone', 'sso'] as const, 2],
        [['phone', 'sso', 'qr'] as const, 3],
    ])('renders %s configured alternates', (methods, count) => {
        const { tree } = render({ methods: [...methods] as never });
        const ids = testIDs(tree).filter((i) => i.startsWith('method-'));
        expect(ids).toHaveLength(count);
        // No heading over empty space.
        expect(testIDs(tree).includes('sign-in-alternates')).toBe(count > 0);
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('refuses to submit empty fields without calling the server', async () => {
        const { tree, onSignIn } = render();
        await ReactTestRenderer.act(async () => {
            (find(tree, 'sign-in-submit').props as { onPress?: () => void }).onPress?.();
        });
        expect(onSignIn).not.toHaveBeenCalled();
        expect(testIDs(tree)).toContain('sign-in-error');
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('passes trimmed credentials through', async () => {
        const { tree, onSignIn } = render();
        await ReactTestRenderer.act(async () => {
            (find(tree, 'sign-in-email').props as { onChangeText?: (s: string) => void }).onChangeText?.('  ron@fleetbase.io ');
            (find(tree, 'sign-in-password').props as { onChangeText?: (s: string) => void }).onChangeText?.('secret');
        });
        await ReactTestRenderer.act(async () => {
            (find(tree, 'sign-in-submit').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        expect(onSignIn).toHaveBeenCalledWith('ron@fleetbase.io', 'secret');
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('surfaces a failure inline without saying which half was wrong', async () => {
        const onSignIn = jest.fn().mockRejectedValue(new Error('Authentication failed using password provided.'));
        const { tree } = render({ onSignIn });
        await ReactTestRenderer.act(async () => {
            (find(tree, 'sign-in-email').props as { onChangeText?: (s: string) => void }).onChangeText?.('a@b.c');
            (find(tree, 'sign-in-password').props as { onChangeText?: (s: string) => void }).onChangeText?.('x');
        });
        await ReactTestRenderer.act(async () => {
            (find(tree, 'sign-in-submit').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        const text = textOf(tree);
        expect(testIDs(tree)).toContain('sign-in-error');
        expect(text).not.toMatch(/no user|email not found/i);
        ReactTestRenderer.act(() => tree.unmount());
    });

    // Unlike every other mutation, this one cannot be queued — there is no
    // session to act on behalf of.
    it('blocks sign-in offline rather than queueing it', () => {
        const { tree } = render({}, false);
        expect(testIDs(tree)).toContain('sign-in-offline');
        expect((find(tree, 'sign-in-submit').props as { disabled?: boolean }).disabled).toBe(true);
        ReactTestRenderer.act(() => tree.unmount());
    });
});
