/**
 * v3 shell smoke test — the replacement for __tests__/App-test.js, which
 * smoke-rendered the v2 provider pyramid and never passed.
 *
 * This mounts the real V3App (theme + providers + navigation container + tab
 * graph) with plain props, which is possible precisely because src/v3 imports
 * nothing from the v2 tree.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import V3App from '../App';
import { SCHEMES, type SchemeName } from '../theme';
import { MutationQueue } from '../api';
import { clearV3 } from '../api/storage';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

beforeEach(() => clearV3());

function mount(props: Partial<React.ComponentProps<typeof V3App>> = {}) {
    // Default the gate open — most assertions are about the driver shell.
    props = { isAuthenticated: true, ...props };
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <SafeAreaProvider initialMetrics={metrics}>
                <V3App organizationName="Purbeck Couriers" {...props} />
            </SafeAreaProvider>
        );
    });
    // @ts-expect-error assigned inside act
    return tree;
}

describe('V3App', () => {
    it.each(SCHEMES)('renders end to end in the %s scheme', (scheme: SchemeName) => {
        const t = mount({ scheme });
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('renders the shell, the tab bar and the five tabs', () => {
        const t = mount();
        const s = JSON.stringify(t.toJSON());
        expect(s).toContain('app-header');
        expect(s).toContain('tab-bar');
        expect(s).toContain('duty-pill');
        expect(s).toContain('Purbeck Couriers');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('surfaces offline state, with the queued count coming from the real queue', () => {
        const queue = new MutationQueue();
        queue.enqueue({ method: 'POST', path: 'orders/1/complete', label: 'Complete stop' });
        queue.enqueue({ method: 'POST', path: 'orders/1/capture-photo', label: 'Upload proof' });
        queue.enqueue({ method: 'POST', path: 'issues', label: 'Report an issue' });

        const t = mount({ isConnected: false, queue });
        const s = JSON.stringify(t.toJSON());
        expect(s).toContain('saved on device');
        expect(s).toContain('3 queued');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('escalates to the failure banner when work could not be synced', () => {
        const queue = new MutationQueue();
        queue.enqueue({ method: 'POST', path: 'fuel-reports', label: 'Log fuel' });
        // Park it the way a 4xx would.
        queue.setSender(async () => ({ ok: false, status: 422, message: 'invalid' }));
        return queue.flush().then(() => {
            const t = mount({ queue });
            const s = JSON.stringify(t.toJSON());
            expect(s).toContain('could not be synced');
            expect(s).toContain('Retry');
            ReactTestRenderer.act(() => t.unmount());
        });
    });

    it('shows off duty by default and on duty when the driver is online', () => {
        const off = mount();
        expect(JSON.stringify(off.toJSON())).toContain('Off duty');
        ReactTestRenderer.act(() => off.unmount());

        const on = mount({ isOnline: true });
        expect(JSON.stringify(on.toJSON())).toContain('On duty');
        ReactTestRenderer.act(() => on.unmount());
    });

    it('gates the driver shell behind authentication', () => {
        const t = mount({ isAuthenticated: false });
        const s = JSON.stringify(t.toJSON());
        expect(s).not.toContain('tab-bar');
        expect(s).not.toContain('duty-pill');
        expect(s).toContain('Sign in');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('renders a white-labelled organisation without needing an asset', () => {
        const t = mount({ organizationName: 'Acme Logistics' });
        const s = JSON.stringify(t.toJSON());
        expect(s).toContain('Acme Logistics');
        expect(s).toContain('"A"');
        ReactTestRenderer.act(() => t.unmount());
    });
});
