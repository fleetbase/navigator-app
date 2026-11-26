/** Home tab (route `Today`), and the navigation hand-off shared by every tab that starts a drive. */
import NavigationHandoffScreen from '../../screens/NavigationHandoffScreen';
import TodayScreen from '../../screens/TodayScreen';
import type { Destination } from '../../navigate/handoff';
import { useDriverId, useFocusCount, useHandoffDestination, useLeaveWhenRemoved, type Nav } from '../session';

/*
 * The dashboard is an index of the driver's day, so most of what it opens lives
 * in another tab. `initial: false` keeps that tab's own first screen underneath,
 * so Back from there lands on the tab's home rather than nowhere.
 */
export function TodayHome({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const reloadToken = useFocusCount();
    return (
        <TodayScreen
            driverId={driverId}
            reloadToken={reloadToken}
            onOpenOrder={(orderId) => navigation.navigate('Orders', { screen: 'OrderDetail', params: { orderId }, initial: false })}
            onOpenWaypoint={(manifestId, stopId) => navigation.navigate('Orders', { screen: 'StopDetail', params: { manifestId, stopId }, initial: false })}
            onNavigate={(destination, orderId) => navigation.navigate('NavigationHandoff', { destination, orderId })}
            onOpenOffers={() => navigation.navigate('Orders', { screen: 'Offers', initial: false })}
            onOpenSyncQueue={() => navigation.navigate('Account', { screen: 'SyncQueue', initial: false })}
            onOpenInspection={(vehicleId, vehicleName) => navigation.navigate('Account', { screen: 'Inspection', params: { vehicleId, vehicleName }, initial: false })}
            onOpenVehicle={() => navigation.navigate('Account', { screen: 'MyVehicle', initial: false })}
            onOpenOrganizations={() => navigation.navigate('Account', { screen: 'OrgSwitcher', initial: false })}
            onOpenChat={() => navigation.navigate('Inbox')}
            onLogFuel={() => navigation.navigate('Account', { screen: 'FuelReportCreate', params: {}, initial: false })}
        />
    );
}

export function NavigationHandoff({
    route,
    navigation,
}: {
    route: { params?: { destination?: Destination; orderId?: string } };
    navigation: Nav;
}) {
    useLeaveWhenRemoved(route.params?.orderId, navigation);
    const destination = useHandoffDestination(route.params?.orderId, route.params?.destination);
    return <NavigationHandoffScreen destination={destination} onDone={navigation.goBack} />;
}
