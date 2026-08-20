import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { AppHeader, DutyPill, DutySheet, DutyProvider, OfflineBar, SyncProvider, useDuty } from '../index';

function render(ui: React.ReactNode, scheme: SchemeName = 'dark') {
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>{ui}</Theme>
            </TamaguiProvider>
        );
    });
    // @ts-expect-error assigned inside act
    return tree;
}
const json = (t: ReactTestRenderer.ReactTestRenderer) => JSON.stringify(t.toJSON());

describe('app shell', () => {
    it.each(SCHEMES)('renders the header in the %s scheme', (scheme) => {
        const t = render(<AppHeader organizationName="Purbeck Couriers" duty="on" />, scheme);
        expect(json(t)).toContain('Purbeck Couriers');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('derives the brand mark from the organisation so white-label needs no asset', () => {
        const t = render(<AppHeader organizationName="acme logistics" duty="off" />);
        expect(json(t)).toContain('"A"');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('states duty in words, not just colour', () => {
        for (const [duty, label] of [['off', 'Off duty'], ['on', 'On duty'], ['break', 'On break']] as const) {
            const t = render(<DutyPill duty={duty} />);
            expect(json(t)).toContain(label);
            ReactTestRenderer.act(() => t.unmount());
        }
    });

    it('shows break as unavailable rather than hiding it when unsupported', () => {
        const t = render(<DutySheet duty="on" breakSupported={false} onSelect={() => {}} />);
        const s = json(t);
        expect(s).toContain('On break');
        expect(s).toContain('Not available for this organisation yet');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('gives the sheet a reachable exit — the backdrop is out of thumb range', () => {
        const onDismiss = jest.fn();
        const t = render(<DutySheet duty="on" breakSupported onSelect={() => {}} onDismiss={onDismiss} />);
        expect(json(t)).toContain('duty-sheet-cancel');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('warns before going off duty with stops outstanding', () => {
        const t = render(<DutySheet duty="on" breakSupported onSelect={() => {}} activeStopCount={3} />);
        expect(json(t)).toContain('3 stops to complete');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('refuses a break transition that the org cannot support, and says why', async () => {
        let ctx: ReturnType<typeof useDuty> | null = null;
        const Probe = () => { ctx = useDuty(); return null; };
        const t = render(<DutyProvider isOnline breakSupported={false}><Probe /></DutyProvider>);
        await ReactTestRenderer.act(async () => { await ctx!.setDuty('break'); });
        expect(ctx!.duty).toBe('on');
        expect(ctx!.error?.message).toMatch(/not available/i);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('rolls the pill back when the toggle call fails', async () => {
        let ctx: ReturnType<typeof useDuty> | null = null;
        const Probe = () => { ctx = useDuty(); return null; };
        const t = render(
            <DutyProvider isOnline={false} onToggleOnline={() => Promise.reject(new Error('network down'))}>
                <Probe />
            </DutyProvider>
        );
        await ReactTestRenderer.act(async () => { await ctx!.setDuty('on'); });
        expect(ctx!.duty).toBe('off');
        expect(ctx!.error?.message).toBe('network down');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('costs no vertical space when online, idle and empty', () => {
        const t = render(<SyncProvider><OfflineBar /></SyncProvider>);
        expect(t.toJSON()).toBeNull();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('reports the queued count when offline', () => {
        const t = render(<SyncProvider isOnline={false} queuedCount={2}><OfflineBar /></SyncProvider>);
        const s = json(t);
        expect(s).toContain('saved on device');
        expect(s).toContain('2 queued');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('escalates a failed sync with a retry', () => {
        const t = render(<SyncProvider syncState="failed" queuedCount={1}><OfflineBar /></SyncProvider>);
        const s = json(t);
        expect(s).toContain('could not be synced');
        expect(s).toContain('Retry');
        ReactTestRenderer.act(() => t.unmount());
    });
});
