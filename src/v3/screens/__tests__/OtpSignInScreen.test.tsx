import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { OtpSignInScreen } from '../OtpSignInScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';
import { looksLikePhone, normalizePhone } from '../../data';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

let fetchMock: jest.Mock;
let queue: MutationQueue;

/** `method` is the server's answer — sms, or email when sms threw. */
function mockApi(send: unknown = { status: 'OK', method: 'sms' }, verify: unknown = { id: 'driver_1', token: 't' }) {
    fetchMock.mockImplementation((url: string) => {
        const u = String(url);
        const body = u.includes('verify-code') ? verify : send;
        if (body === 'fail') {
            return Promise.resolve({
                ok: false, status: 400, statusText: 'Bad Request',
                json: () => Promise.resolve({ error: 'No driver with this phone # found.' }),
            });
        }
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) });
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
            <SafeAreaProvider initialMetrics={metrics}>
                <TamaguiProvider config={config} defaultTheme={scheme}>
                    <Theme name={scheme}>
                        <SyncProvider>
                            <FleetbaseProvider host="https://x.test" queue={queue}>
                                {node}
                            </FleetbaseProvider>
                        </SyncProvider>
                    </Theme>
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

describe('phone helpers', () => {
    it('accepts the shapes a driver actually types', () => {
        for (const value of ['+6581000001', '65 8100 0001', '+1 (980) 934-1969']) {
            expect({ value, ok: looksLikePhone(value) }).toEqual({ value, ok: true });
        }
    });

    it('rejects text and obviously wrong lengths', () => {
        for (const value of ['not a phone', '123', '', '1'.repeat(20)]) {
            expect({ value, ok: looksLikePhone(value) }).toEqual({ value, ok: false });
        }
    });

    it('normalises to a single leading plus', () => {
        expect(normalizePhone('65 8100 0001')).toBe('+6581000001');
        expect(normalizePhone('+1 (980) 934-1969')).toBe('+19809341969');
    });
});

describe('OtpSignInScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<OtpSignInScreen />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('cannot request a code for something that is not a phone number', async () => {
        const t = await mount(<OtpSignInScreen />);
        expect(byID(t, 'otp-send').props.disabled).toBe(true);
        type(t, 'input-phone', '+6581000001');
        expect(byID(t, 'otp-send').props.disabled).toBe(false);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says it texted you when the server used sms', async () => {
        const t = await mount(<OtpSignInScreen />);
        type(t, 'input-phone', '+6581000001');
        await press(t, 'otp-send');
        expect(testIDs(t)).toContain('otp-sent-sms');
        expect(textOf(t)).toContain('texted');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says it emailed you when the server fell back to email', async () => {
        // Telling someone to check their texts when the code went to their
        // inbox is a dead end they cannot reason their way out of.
        mockApi({ status: 'OK', method: 'email' });
        const t = await mount(<OtpSignInScreen />);
        type(t, 'input-phone', '+6581000001');
        await press(t, 'otp-send');
        expect(testIDs(t)).toContain('otp-sent-email');
        expect(textOf(t)).toContain('email');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('reports an unknown number rather than pretending it sent something', async () => {
        mockApi('fail');
        const t = await mount(<OtpSignInScreen />);
        type(t, 'input-phone', '+15550000000');
        await press(t, 'otp-send');
        expect(testIDs(t)).toContain('otp-error');
        expect(testIDs(t)).not.toContain('otp-sent-sms');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('will not submit a partial code', async () => {
        const t = await mount(<OtpSignInScreen />);
        type(t, 'input-phone', '+6581000001');
        await press(t, 'otp-send');
        type(t, 'input-code', '123');
        expect(byID(t, 'otp-verify').props.disabled).toBe(true);
        type(t, 'input-code', '123456');
        expect(byID(t, 'otp-verify').props.disabled).toBe(false);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('keeps the code to six digits and ignores anything else typed', async () => {
        const t = await mount(<OtpSignInScreen />);
        type(t, 'input-phone', '+6581000001');
        await press(t, 'otp-send');
        type(t, 'input-code', 'a1b2c3d4e5f6g7');
        expect(byID(t, 'input-code').props.value).toBe('123456');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('sends the identity with the code, since verify accepts either', async () => {
        const t = await mount(<OtpSignInScreen />);
        type(t, 'input-phone', '65 8100 0001');
        await press(t, 'otp-send');
        type(t, 'input-code', '123456');
        await press(t, 'otp-verify');

        const verify = fetchMock.mock.calls.find((c) => String(c[0]).includes('verify-code'));
        const body = JSON.parse(String(verify?.[1]?.body));
        expect(body).toEqual({ identity: '+6581000001', code: '123456', for: 'driver_login' });
        ReactTestRenderer.act(() => t.unmount());
    });

    it('hands the driver up rather than creating the session itself', async () => {
        const onVerified = jest.fn();
        const t = await mount(<OtpSignInScreen onVerified={onVerified} />);
        type(t, 'input-phone', '+6581000001');
        await press(t, 'otp-send');
        type(t, 'input-code', '123456');
        await press(t, 'otp-verify');
        expect(onVerified).toHaveBeenCalledWith(expect.objectContaining({ id: 'driver_1' }));
        ReactTestRenderer.act(() => t.unmount());
    });

    it('reports a wrong code without losing the number', async () => {
        mockApi({ status: 'OK', method: 'sms' }, { error: 'Invalid verification code!' });
        const t = await mount(<OtpSignInScreen />);
        type(t, 'input-phone', '+6581000001');
        await press(t, 'otp-send');
        type(t, 'input-code', '000000');
        await press(t, 'otp-verify');
        expect(testIDs(t)).toContain('otp-error');
        expect(testIDs(t)).toContain('input-code');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('lets a mistyped number be corrected without starting over', async () => {
        const t = await mount(<OtpSignInScreen />);
        type(t, 'input-phone', '+6581000001');
        await press(t, 'otp-send');
        expect(testIDs(t)).toContain('input-code');

        await press(t, 'otp-change-number');
        expect(testIDs(t)).toContain('input-phone');
        expect(byID(t, 'input-phone').props.value).toBe('+6581000001');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('cannot request a code with no connection', async () => {
        const t = await mount(
            <SyncProvider isOnline={false}>
                <OtpSignInScreen />
            </SyncProvider>
        );
        expect(testIDs(t)).toContain('otp-offline');
        ReactTestRenderer.act(() => t.unmount());
    });
});
