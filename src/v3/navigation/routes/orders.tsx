/** Jobs tab (route name `Orders`): the jobs home, the order screen and what an order links to. */
import OrdersScreen from '../../screens/OrdersScreen';
import OrderDetailScreen from '../../screens/OrderDetailScreen';
import EditPayloadItemScreen from '../../screens/EditPayloadItemScreen';
import ItemDetailScreen from '../../screens/ItemDetailScreen';
import OrderTimelineScreen from '../../screens/OrderTimelineScreen';
import ProofCaptureScreen from '../../screens/ProofCaptureScreen';
import DestinationScreen from '../../screens/DestinationScreen';
import OffersScreen from '../../screens/OffersScreen';
import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useShell } from '../DriverShell';
import { useSync } from '../../shell/SyncContext';
import { proofMethodOf } from '../../data/useProofCapture';
import { useAssignedVehicle, useDriverId, useFocusCount, useLeaveWhenRemoved, type Nav } from '../session';
import type { InspectionOrderContext } from '../../data';
import { useNavigationHandoffSheet } from '../../navigate/useNavigationHandoffSheet';

export function OrdersHome({ navigation, route }: { navigation: Nav; route?: { params?: { mode?: 'orders' | 'route' | 'map' | 'schedule' } } }) {
    const driverId = useDriverId();
    // Focus is a refetch: back from a waypoint or an order, the route may have moved on.
    const reloadToken = useFocusCount();
    return (
        <OrdersScreen
            driverId={driverId}
            reloadToken={reloadToken}
            // Another tab may ask for a view: navigate('Orders', { screen: 'OrdersHome', params: { mode: 'route' } }).
            // 'orders', 'route' and 'map' are the views they always were; 'schedule' is the new one.
            initialMode={route?.params?.mode}
            modeRequest={route?.params}
            onOpenOrder={(orderId) => navigation.navigate('OrderDetail', { orderId })}
            onOpenOffers={() => navigation.navigate('Offers')}
            // The manifest screens are registered in this stack too, so the route is worked from Jobs.
            onOpenStop={(manifestId, stopId) => navigation.navigate('StopDetail', { manifestId, stopId })}
            onOptimise={(manifestId) => navigation.navigate('OptimisePreview', { manifestId })}
        />
    );
}

export function OrderDetail({ route, navigation }: { route: { params?: { orderId?: string } }; navigation: Nav }) {
    const orderId = route.params?.orderId;
    // Focus is a refetch: back from proof capture, from a chat, from the app
    // being backgrounded — the order may have changed meanwhile.
    const reloadToken = useFocusCount();
    useLeaveWhenRemoved(orderId, navigation);
    /*
     * The order's map runs to the very top of the screen, under the status bar,
     * as Home's does: the shell gives up its status-bar padding while this
     * screen is in front (see `setBleedTop`). Asked for here, not in the screen,
     * so the screen itself needs no navigator around it.
     */
    const { setBleedTop } = useShell();
    useFocusEffect(
        useCallback(() => {
            setBleedTop(true);
            return () => setBleedTop(false);
        }, [setBleedTop])
    );
    // Navigate opens the choice of app as a sheet over the order.
    const handoff = useNavigationHandoffSheet();
    /*
     * One confirmation opens the proof screen once. A second request that comes
     * while this screen is no longer the one in front (the proof screen is
     * already opening over it), or straight after the first, is let go: two
     * proof screens would be two cameras, and the second one shows black.
     */
    const proofOpenedAt = useRef(0);
    const openProof = useCallback(
        (request: object) => {
            const now = Date.now();
            const focused = (navigation as { isFocused?: () => boolean }).isFocused?.() ?? true;
            if (!focused || now - proofOpenedAt.current < 1000) return;
            proofOpenedAt.current = now;
            navigation.navigate('ProofCapture', request);
        },
        [navigation]
    );
    /*
     * A step that needs an inspection opens its checklist, of the driver's
     * assigned vehicle, with the order and step as its context. Let go twice
     * in a row for the same reason as proof: one checklist, not two.
     */
    const { vehicleId, vehicleName } = useAssignedVehicle();
    const inspectionOpenedAt = useRef(0);
    const openInspection = useCallback(
        (request: InspectionOrderContext & { formId: string }) => {
            const now = Date.now();
            const focused = (navigation as { isFocused?: () => boolean }).isFocused?.() ?? true;
            if (!focused || now - inspectionOpenedAt.current < 1000) return;
            inspectionOpenedAt.current = now;
            const { formId, ...order } = request;
            navigation.navigate('InspectionChecklist', { formId, vehicleId, vehicleName, order });
        },
        [navigation, vehicleId, vehicleName]
    );
    return (
        <>
        <OrderDetailScreen
            orderId={String(orderId ?? '')}
            reloadToken={reloadToken}
            onBack={() => navigation.goBack()}
            // The issue form opens already about this order: its id, and its tracking number to show.
            onReportIssue={({ label }) => navigation.navigate('Account', { screen: 'IssueCreate', params: { order: orderId, orderLabel: label }, initial: false })}
            // An item opens in the item pager over the order now (screens/item/ItemPagerModal), so there is no item screen to navigate to from here.
            // The order id travels, not just the point: the hand-off reads the
            // order's *current* destination, so an edit made after this tap
            // still lands the driver at the right door.
            onNavigate={(destination) => handoff.open(destination, orderId)}
            // While the footer shows its slide to confirm, the system's swipe back (which starts at
            // the same edge of the screen as the slide) is off, so the slide is not taken for it.
            onConfirmingChange={(confirming) => (navigation as { setOptions?: (options: object) => void }).setOptions?.({ gestureEnabled: !confirming })}
            onCaptureProof={openProof}
            onStartInspection={openInspection}
            onChangeDestination={() => navigation.navigate('Destination', { orderId })}
            // The order's activity history opens in a sheet over the order now, so there is no timeline to navigate to from here.
            // The order's chat with dispatch (asked for from the server, which starts it when needed) and the customer's thread open here.
            onOpenChannel={(channel) => navigation.navigate('Inbox', { screen: 'Conversation', params: { channel, channelId: channel.id }, initial: false })}
            // Only against a server that cannot give the order a chat of its own: a new conversation, as before.
            onMessageDispatch={() => navigation.navigate('Inbox', { screen: 'NewConversation', initial: false })}
        />
        {handoff.sheet}
        </>
    );
}

export function EntityDetail({
    route,
    navigation,
}: {
    route: { params?: { orderId?: string; entityId?: string; entity?: Record<string, unknown> } };
    navigation: Nav;
}) {
    useLeaveWhenRemoved(route.params?.orderId, navigation);
    /*
     * The order screen opens its items in a pager over itself and no longer
     * comes here. The route stays for whatever else navigates to it (a build's
     * own routes, a replaced order screen) and shows the same item card, on a
     * screen: with the order id it edits in place and scans, as the pager does.
     */
    return (
        <ItemDetailScreen
            entityId={route.params?.entityId}
            entity={route.params?.entity}
            orderId={route.params?.orderId}
            onBack={navigation.goBack}
            onEdit={(entity) => navigation.navigate('EditPayloadItem', { orderId: route.params?.orderId, entity })}
        />
    );
}

export function OrderTimeline({ route, navigation }: { route: { params?: { orderId?: string } }; navigation: Nav }) {
    useLeaveWhenRemoved(route.params?.orderId, navigation);
    return <OrderTimelineScreen orderId={String(route.params?.orderId ?? '')} />;
}

export function EditPayloadItem({
    route,
    navigation,
}: {
    route: { params?: { orderId?: string; entity?: { id: string } } };
    navigation: Nav;
}) {
    return (
        <EditPayloadItemScreen
            orderId={String(route.params?.orderId ?? '')}
            entity={route.params?.entity ?? { id: '' }}
            onDone={navigation.goBack}
        />
    );
}

export function ProofCapture({ route, navigation }: { route: { params?: { orderId?: string; activityCode?: string; activityLabel?: string; podMethod?: string | null; expected?: string[] } }; navigation: Nav }) {
    const p = route.params ?? {};
    useLeaveWhenRemoved(p.orderId, navigation);
    /*
     * Proof by scanning is the camera, edge to edge and under the status bar,
     * and proof by signature is the signing pad, as large as the screen allows:
     * the shell gives up its status-bar padding while either is in front, as it
     * does for the order's map. A photo keeps the title bar and the padding.
     */
    const method = proofMethodOf(p.podMethod);
    const fullScreen = method !== 'photo';
    const { setBleedTop } = useShell();
    useFocusEffect(
        useCallback(() => {
            if (!fullScreen) return undefined;
            setBleedTop(true);
            return () => setBleedTop(false);
        }, [fullScreen, setBleedTop])
    );
    /*
     * While a signature is being made, the system's swipe back is off: it starts
     * at the edge of the screen, where a signature may start too, and would take
     * the stroke and the screen with it. The close button is the way out.
     */
    const signing = method === 'signature';
    useEffect(() => {
        if (signing) (navigation as { setOptions?: (options: object) => void }).setOptions?.({ gestureEnabled: false });
    }, [signing, navigation]);
    // While the shell's strip about signal and syncing floats under the top buttons, the screen leaves that line to it.
    const { isOnline, queuedCount, syncState, lastSyncedCount } = useSync();
    const stripShowing = !isOnline || syncState === 'failed' || (syncState === 'syncing' && queuedCount > 0) || lastSyncedCount > 0;
    return (
        <ProofCaptureScreen
            stripShowing={stripShowing}
            orderId={p.orderId ?? ''}
            activityCode={p.activityCode ?? ''}
            activityLabel={p.activityLabel ?? ''}
            podMethod={p.podMethod}
            expected={p.expected}
            // Back to the order once the proof is captured or queued. The
            // capture is recorded against the activity (proofLedger), so the
            // order advances on return rather than asking for proof again.
            onCaptured={() => navigation.goBack()}
            onCancel={() => navigation.goBack()}
        />
    );
}

export function Destination({ route, navigation }: { route: { params?: { orderId?: string } }; navigation: Nav }) {
    useLeaveWhenRemoved(route.params?.orderId, navigation);
    return <DestinationScreen orderId={String(route.params?.orderId ?? '')} onDone={() => navigation.goBack()} />;
}

export function Offers({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    // The map runs to the top edge, under the status bar, as the order screen's does.
    const { setBleedTop } = useShell();
    useFocusEffect(
        useCallback(() => {
            setBleedTop(true);
            return () => setBleedTop(false);
        }, [setBleedTop])
    );
    return <OffersScreen driverId={driverId} onBack={navigation.goBack} onOpenOrder={(orderId) => navigation.navigate('OrderDetail', { orderId })} />;
}
