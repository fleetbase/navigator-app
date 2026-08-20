import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { TamaguiProvider, Theme } from 'tamagui';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { DriverShell } from '../index';
import { DutyProvider, SyncProvider } from '../../shell';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

function render(scheme: SchemeName = 'dark', props = {}) {
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <SafeAreaProvider initialMetrics={metrics}>
                <TamaguiProvider config={config} defaultTheme={scheme}>
                    <Theme name={scheme}>
                        <SyncProvider>
                            <DutyProvider isOnline>
                                <NavigationContainer>
                                    <DriverShell organizationName="Purbeck Couriers" {...props} />
                                </NavigationContainer>
                            </DutyProvider>
                        </SyncProvider>
                    </Theme>
                </TamaguiProvider>
            </SafeAreaProvider>
        );
    });
    // @ts-expect-error assigned inside act
    return tree;
}
const json = (t: ReactTestRenderer.ReactTestRenderer) => JSON.stringify(t.toJSON());

describe('v3 navigation', () => {
    it.each(SCHEMES)('mounts the whole shell in the %s scheme', (scheme) => {
        const t = render(scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('exposes exactly the five designed tabs, in order', () => {
        const t = render();
        const s = json(t);
        for (const tab of ['Today', 'Route', 'Orders', 'Inbox', 'Account']) {
            expect(s).toContain(`tab-${tab}`);
        }
        // v2's tabs that no longer exist as top-level destinations
        expect(s).not.toContain('tab-Dash');
        expect(s).not.toContain('tab-Reports');
        expect(s).not.toContain('tab-Chat');
        const order = ['Today', 'Route', 'Orders', 'Inbox', 'Account'].map((n) => s.indexOf(`tab-${n}`));
        expect(order).toEqual([...order].sort((a, b) => a - b));
        ReactTestRenderer.act(() => t.unmount());
    });

    it('renders the organisation, not the app name and build number', () => {
        const t = render();
        const s = json(t);
        expect(s).toContain('Purbeck Couriers');
        // v2's header burned a row on this.
        expect(s).not.toMatch(/v\d+\.\d+\.\d+ #\d+/);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows tab badges from props rather than hooks in options callbacks', () => {
        const t = render('dark', { badges: { Orders: 4, Inbox: 2 } });
        const s = json(t);
        expect(s).toContain('"4"');
        expect(s).toContain('"2"');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('caps oversized badges rather than breaking the pill', () => {
        const t = render('dark', { badges: { Orders: 250 } });
        expect(json(t)).toContain('99+');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('names the phase and blocker on unbuilt routes', () => {
        const t = render();
        const s = json(t);
        expect(s).toContain('Today');
        expect(s).toContain('Phase 3');
        ReactTestRenderer.act(() => t.unmount());
    });
});
