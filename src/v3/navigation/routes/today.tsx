/** Today tab, and the navigation hand-off shared by every tab that starts a drive. */
import NavigationHandoffScreen from '../../screens/NavigationHandoffScreen';
import TodayScreen from '../../screens/TodayScreen';
import type { Destination } from '../../navigate/handoff';
import { useDriverId, useFocusCount, useHandoffDestination, useLeaveWhenRemoved, type Nav } from '../session';

export function TodayHome({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const reloadToken = useFocusCount();
    return (
        <TodayScreen
            driverId={driverId}
            reloadToken={reloadToken}
            onOpenOrder={(orderId) => navigation.navigate('Orders', { screen: 'OrderDetail', params: { orderId }, initial: false })}
            onNavigate={(destination, orderId) => navigation.navigate('NavigationHandoff', { destination, orderId })}
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
