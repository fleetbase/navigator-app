import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { TamaguiProvider, Theme } from 'tamagui';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { DriverShell } from '../index';
import { DutyProvider, SyncProvider } from '../../shell';
import { FleetbaseProvider, MutationQueue } from '../../api';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

function render(scheme: SchemeName = 'dark', props = {}) {
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <SafeAreaProvider initialMetrics={metrics}>
                <TamaguiProvider config={config} defaultTheme={scheme}>
                    <Theme name={scheme}>
                        <SyncProvider>
                            <FleetbaseProvider host="https://x.test" queue={new MutationQueue()}>
                            <DutyProvider isOnline>
                                <NavigationContainer>
                                    <DriverShell organizationName="Purbeck Couriers" {...props} />
                                </NavigationContainer>
                            </DutyProvider>
                            </FleetbaseProvider>
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

    it('opens on a built Today rather than a placeholder', () => {
        // Today used to be a placeholder reading "Built in Phase 3". It is the
        // first thing a driver sees, so this asserts it is no longer a stub.
        const t = render();
        const s = json(t);
        expect(s).not.toContain('Built in Phase 3');
        expect(s).not.toContain('This route exists so the shell can be navigated');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('still names the phase and the blocker on routes that are not built', () => {
        // Checked on the component rather than through navigation, since the
        // remaining placeholders sit behind tabs the shell does not open on.
        const { Placeholder } = require('../../screens/Placeholder');
        let tree!: ReactTestRenderer.ReactTestRenderer;
        ReactTestRenderer.act(() => {
            tree = ReactTestRenderer.create(
                <SafeAreaProvider initialMetrics={metrics}>
                    <TamaguiProvider config={config} defaultTheme="dark">
                        <Theme name="dark">
                            <Placeholder title="Stop execution" phase="Phase 4b" blockedOn="order-config proof declarations" />
                        </Theme>
                    </TamaguiProvider>
                </SafeAreaProvider>
            );
        });
        const s = JSON.stringify(tree.toJSON());
        expect(s).toContain('Phase 4b');
        expect(s).toContain('order-config proof declarations');
        ReactTestRenderer.act(() => tree.unmount());
    });
});

/**
 * Guards the defect that made the whole content area look dead to touch: screen
 * components were being created during render (`const Orders = () => <.../>`,
 * `component={placeholder('Today', P3)}`), so every parent render produced a new
 * component type and React remounted the entire screen subtree. Chrome kept
 * working, content did not — scroll position, keyboard focus and in-flight
 * touches were all destroyed on each render.
 *
 * A behavioural remount is awkward to observe through the navigator, so this
 * asserts the property that actually matters at the source: nothing is passed to
 * `component=` except a stable identifier.
 */
describe('screen identity', () => {
    const raw = readFileSync(join(__dirname, '..', 'DriverTabs.tsx'), 'utf8');
    // The file documents the bad patterns by quoting them, so comments must go
    // before the source is scanned for them.
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    it('never passes an inline function or a factory call to component=', () => {
        const offenders = [...source.matchAll(/component=\{([^}]*)\}/g)]
            .map((m) => m[1].trim())
            .filter((expr) => expr.includes('=>') || expr.includes('('));

        expect(offenders).toEqual([]);
    });

    it('declares every screen component at module scope', () => {
        // A screen component defined inside another component's body is the
        // same bug wearing a name. Everything referenced by component= must be
        // declared with a top-level `function X(` or `const X =`.
        const referenced = [...source.matchAll(/component=\{(\w+)\}/g)].map((m) => m[1]);
        expect(referenced.length).toBeGreaterThan(10);

        for (const name of referenced) {
            // An import is module scope too — `SettingsScreen` arrives that way.
            const declaredAtModuleScope =
                new RegExp(`^function ${name}\\(`, 'm').test(source) ||
                new RegExp(`^const ${name} =`, 'm').test(source) ||
                new RegExp(`^import .*\\b${name}\\b`, 'm').test(source);
            expect({ name, declaredAtModuleScope }).toEqual({ name, declaredAtModuleScope: true });
        }
    });

    it('keeps screen-scoped values out of props, so screens need no closure', () => {
        // driverId reaches OrdersScreen through context; passing it as a prop is
        // what forced the inline component in the first place.
        expect(source).toContain('DriverIdContext');
        expect(source).not.toMatch(/<OrdersStack\s+driverId/);
    });
});
