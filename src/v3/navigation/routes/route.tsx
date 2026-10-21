/** Route tab: manifests and their stops. */
import RouteScreen from '../../screens/RouteScreen';
import StopDetailScreen from '../../screens/StopDetailScreen';
import StopExecutionScreen from '../../screens/StopExecutionScreen';
import OptimisePreviewScreen from '../../screens/OptimisePreviewScreen';
import { useDriverId, useFocusCount, type Nav } from '../session';

type StopParams = { route: { params?: { manifestId?: string; stopId?: string } }; navigation: Nav };

/** Orders live in their own tab; a stop's order is opened there. */
const openOrderFrom = (navigation: Nav) => (orderId: string) =>
    navigation.navigate('Orders', { screen: 'OrderDetail', params: { orderId } });

export function RouteHome({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const reloadToken = useFocusCount();
    return (
        <RouteScreen
            driverId={driverId}
            reloadToken={reloadToken}
            onOpenStop={(manifestId, stopId) => navigation.navigate('StopDetail', { manifestId, stopId })}
            onOptimise={(manifestId) => navigation.navigate('OptimisePreview', { manifestId })}
            onNavigate={(destination) => navigation.navigate('NavigationHandoff', { destination })}
        />
    );
}

export function StopDetail({ route, navigation }: StopParams) {
    return (
        <StopDetailScreen
            manifestId={String(route.params?.manifestId ?? '')}
            stopId={String(route.params?.stopId ?? '')}
            onNavigate={(destination) => navigation.navigate('NavigationHandoff', { destination })}
            onOpenOrder={openOrderFrom(navigation)}
            onComplete={(manifestId, stopId) => navigation.navigate('StopExecution', { manifestId, stopId })}
        />
    );
}

export function StopExecution({ route, navigation }: StopParams) {
    return (
        <StopExecutionScreen
            manifestId={String(route.params?.manifestId ?? '')}
            stopId={String(route.params?.stopId ?? '')}
            onOpenOrder={openOrderFrom(navigation)}
            onNavigate={(destination) => navigation.navigate('NavigationHandoff', { destination })}
            onDone={() => navigation.navigate('RouteHome')}
        />
    );
}

export function OptimisePreview({ route, navigation }: { route: { params?: { manifestId?: string } }; navigation: Nav }) {
    return <OptimisePreviewScreen manifestId={String(route.params?.manifestId ?? '')} onDone={navigation.goBack} />;
}
