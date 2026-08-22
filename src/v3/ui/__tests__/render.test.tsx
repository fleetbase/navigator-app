/**
 * Proves the component library renders under every scheme.
 *
 * The point of the v3 token layer is that a component never asks which scheme
 * it is in — so the same tree must render in dark, light, sunlight and night
 * without a branch. If a component reaches for a token that only exists in one
 * scheme, this fails.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import {
    Banner, Body, BreakRow, Button, EmptyState, Field, FieldAccessory, HeroValue, HosGauge, OfflineBanner,
    Identifier, ListRow, OfferCard, OrderCard, RouteProgress, ScanChecklistRow, ScannerOverlay, Segmented,
    StatusPill, StepBar, StopRow, Surface, VehicleCard,
} from '../index';

function renderIn(scheme: SchemeName, ui: React.ReactNode) {
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

const domain = (
    <Surface>
        <StopRow sequence={3} name="Harbour View Pharmacy" address="22 Kings Road East, Swanage BH19 1ES"
            trackingNumber="FLE0636178718SG" type="dropoff" itemCount={3} eta="14:32" window="14:00–15:00"
            distanceFromPrevM={2400} durationFromPrevS={540} state="current" />
        <StopRow sequence={4} name="Corfe Castle Post Office" eta="14:58" state="pending" />
        <StopRow sequence={2} name="Wareham Depot — loaded 12 items" state="completed" completedAt="13:41" />
        <BreakRow minutes={30} around="15:15" reason="keeps you within drive-time limits" />
        <ListRow name="My vehicle" meta="Sprinter 316" />
        <OrderCard trackingNumber="FLE0641220975SG" status="driver_enroute"
            stops={[{ name: 'Wareham Depot', detail: 'Pickup · departed 13:41', kind: 'pickup' },
                    { name: 'Harbour View Pharmacy', detail: 'Drop-off · window 14:00–15:00', kind: 'dropoff' }]}
            distanceM={18200} durationS={2520} itemCount={3} customerName="Priya Patel"
            completedStops={2} totalStops={3} />
        <OfferCard trackingNumber="FLE0629988102SG" pickup="Wareham Depot" dropoff="Stoborough Surgery"
            distanceAwayM={4100} payout="£12.40" expiresIn="01:54" />
        <VehicleCard name="Sprinter 316" plate="WD68 KXR" odometerLabel="84,212 km"
            inspectionLabel="Inspection passed 06:40" online />
        <RouteProgress total={7} completed={2} currentIndex={2} finishLabel="finish ~17:05" onTime />
        <HosGauge dailyHours={7.53} weeklyHours={61.17} dailyLimit={11} weeklyLimit={70} />
        <HosGauge dailyHours={0} weeklyHours={0} dailyLimit={11} weeklyLimit={70} enabled={false} />
        <StepBar steps={['ARRIVE', 'SCAN', 'PHOTO', 'SIGN', 'DONE']} activeIndex={1} />
        <ScannerOverlay scanned={1} expected={3} feedback="accepted" lastCode="ENT-000004471-A" onManualEntry={() => {}} />
        <ScanChecklistRow name="Rx cold-chain box" code="ENT-000004471-A" scannedAt="14:32" />
        <ScanChecklistRow name="Dispensary tote" code="ENT-000004471-B" />
        <Field label="Odometer" value="84,212" tabular accessory={<FieldAccessory label="km" />} />
        <Field label="Volume" placeholder="Required" error="Enter the fuel volume from the pump"
            accessory={<FieldAccessory label="L" onPress={() => {}} />} />
        <Segmented options={[{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }]}
            value="metric" onChange={() => {}} />
    </Surface>
);

const sample = (
    <Surface hero padded>
        <Body>Harbour View Pharmacy</Body>
        <Identifier label="TRACKING NUMBER" value="FLE0636178718SG" />
        <StatusPill status="driver_enroute" />
        <StatusPill status="Pending Approval" />
        <HeroValue>14:32</HeroValue>
        <Button>Navigate</Button>
        <Button variant="secondary" loading>
            Details
        </Button>
        <Button variant="destructive" disabled>
            Report failed
        </Button>
        <OfflineBanner queued={2} />
        <Banner tone="danger" message="Proof upload failed" action={{ label: 'Retry', onPress: () => {} }} />
        <EmptyState title="No fuel entries yet" body="Log a fill-up and Navigator works out your economy." />
    </Surface>
);

describe('waypoint ui', () => {
    it.each(SCHEMES)('renders the primitives in the %s scheme', (scheme) => {
        const tree = renderIn(scheme, sample);
        expect(tree.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => tree.unmount());
    });

    // The whole point of the token layer: no component asks which scheme it is
    // in, so the identical tree must render in all four without a branch.
    it.each(SCHEMES)('renders the domain components in the %s scheme', (scheme) => {
        const tree = renderIn(scheme, domain);
        expect(tree.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('renders every stop identifier in full inside a route list', () => {
        const tree = renderIn('dark', domain);
        const json = JSON.stringify(tree.toJSON());
        expect(json).toContain('FLE0636178718SG');
        expect(json).toContain('ENT-000004471-A');
        expect(json).not.toContain('…');
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('shows an honest not-required state when HOS is disabled', () => {
        const tree = renderIn('dark', <HosGauge dailyHours={0} weeklyHours={0} dailyLimit={11} weeklyLimit={70} enabled={false} />);
        expect(JSON.stringify(tree.toJSON())).toContain('not required');
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('renders identifiers in full — never truncated', () => {
        const tree = renderIn('dark', <Identifier value="FLE0636178718SG" />);
        const json = JSON.stringify(tree.toJSON());
        expect(json).toContain('FLE0636178718SG');
        // numberOfLines would clamp the identifier; the component must not set it.
        expect(json).not.toContain('"numberOfLines"');
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('pairs status colour with a shape and a readable label', () => {
        const tree = renderIn('dark', <StatusPill status="driver_enroute" />);
        const json = JSON.stringify(tree.toJSON());
        // the design says "En route", not the humanised "Driver Enroute"
        expect(json).toContain('En route');
        // marker present => not colour-only encoding
        expect(json).toContain('rotate');
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('marks a disabled button as disabled for assistive tech', () => {
        const tree = renderIn('dark', <Button disabled>Blocked</Button>);
        const json = JSON.stringify(tree.toJSON());
        expect(json).toContain('"disabled":true');
        ReactTestRenderer.act(() => tree.unmount());
    });
});

describe('Button availability is visible, not just functional', () => {
    /*
     * A driver has to be able to tell at a glance whether the primary action is
     * available. Read the resolved style rather than the variant definition:
     * what is written in `styled()` and what lands on the host view are not the
     * same thing, and only the second one is what anybody sees.
     */
    const opacityOf = (node: React.ReactElement) => {
        let tree: ReactTestRenderer.ReactTestRenderer;
        ReactTestRenderer.act(() => {
            tree = ReactTestRenderer.create(
                <TamaguiProvider config={config} defaultTheme="dark">
                    <Theme name="dark">{node}</Theme>
                </TamaguiProvider>
            );
        });
        // @ts-expect-error assigned inside act
        const host = tree.root.findAll((n) => n.props?.testID === 'measured').pop();
        const style = Object.assign({}, ...[host?.props?.style ?? {}].flat());
        ReactTestRenderer.act(() => tree.unmount());
        return style.opacity ?? 1;
    };

    it('dims a disabled button well below an enabled one', () => {
        const enabled = opacityOf(<Button testID="measured">Send report</Button>);
        const disabled = opacityOf(
            <Button testID="measured" disabled>
                Send report
            </Button>
        );
        expect(enabled).toBeGreaterThan(0.9);
        expect(disabled).toBeLessThan(0.6);
    });

    it('dims while loading too, since the action is equally unavailable', () => {
        expect(
            opacityOf(
                <Button testID="measured" loading>
                    Send report
                </Button>
            )
        ).toBeLessThan(0.6);
    });
});
