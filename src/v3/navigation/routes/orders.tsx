/** Orders tab. */
import OrdersScreen from '../../screens/OrdersScreen';
import OrderDetailScreen from '../../screens/OrderDetailScreen';
import EditPayloadItemScreen from '../../screens/EditPayloadItemScreen';
import ItemDetailScreen from '../../screens/ItemDetailScreen';
import OrderTimelineScreen from '../../screens/OrderTimelineScreen';
import ProofCaptureScreen from '../../screens/ProofCaptureScreen';
import DestinationScreen from '../../screens/DestinationScreen';
import OffersScreen from '../../screens/OffersScreen';
import { useDriverId, useFocusCount, useLeaveWhenRemoved, type Nav } from '../session';

export function OrdersHome({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    return (
        <OrdersScreen
            driverId={driverId}
            onOpenOrder={(orderId) => navigation.navigate('OrderDetail', { orderId })}
            onOpenOffers={() => navigation.navigate('Offers')}
        />
    );
}

export function OrderDetail({ route, navigation }: { route: { params?: { orderId?: string } }; navigation: Nav }) {
    const orderId = route.params?.orderId;
    // Focus is a refetch: back from proof capture, from a chat, from the app
    // being backgrounded — the order may have changed meanwhile.
    const reloadToken = useFocusCount();
    useLeaveWhenRemoved(orderId, navigation);
    return (
        <OrderDetailScreen
            orderId={String(orderId ?? '')}
            reloadToken={reloadToken}
            onOpenEntity={({ id, entity }) => navigation.navigate('EntityDetail', { orderId, entityId: id, entity })}
            // The order id travels, not just the point: the hand-off reads the
            // order's *current* destination, so an edit made after this tap
            // still lands the driver at the right door.
            onNavigate={(destination) => navigation.navigate('NavigationHandoff', { destination, orderId })}
            onOpenTimeline={() => navigation.navigate('OrderTimeline', { orderId })}
            onCaptureProof={(request) => navigation.navigate('ProofCapture', request)}
            onChangeDestination={() => navigation.navigate('Destination', { orderId })}
            onOpenChannel={(channel) => navigation.navigate('Inbox', { screen: 'Conversation', params: { channel, channelId: channel.id }, initial: false })}
            onMessageDispatch={() => navigation.navigate('Inbox', { screen: 'NewConversation', initial: false })}
        />
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
    return (
        <ItemDetailScreen
            entityId={route.params?.entityId}
            entity={route.params?.entity}
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
    return (
        <ProofCaptureScreen
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
    return <OffersScreen driverId={driverId} onOpenOrder={(orderId) => navigation.navigate('OrderDetail', { orderId })} />;
}
