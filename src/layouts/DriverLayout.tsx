import { useEffect } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { later } from '../utils';
import { useNotification } from '../contexts/NotificationContext';
import useFleetbase from '../hooks/use-fleetbase';

const DriverLayout = ({ children, state, descriptors, navigation: tabNavigation }) => {
    const navigation = useNavigation();
    const { fleetbase } = useFleetbase();
    const { addNotificationListener, removeNotificationListener } = useNotification();

    useEffect(() => {
        if (!fleetbase) {
            return;
        }

        const handlePushNotification = async (notification, action) => {
            console.log('[Notification]', notification);
            const { payload } = notification;
            const id = payload.id;
            const type = payload.type;

            if (typeof id === 'string' && id.startsWith('order_')) {
                try {
                    const order = await fleetbase.orders.findRecord(id);
                    const orderId = order.id;

                    const tabState = tabNavigation.getState();
                    const currentTabRoute = tabState.routes[tabState.index];

                    const isOnDriverTaskTab = currentTabRoute.name === 'DriverTaskTab';
                    const driverTaskStackState = currentTabRoute?.state;
                    const currentScreen = driverTaskStackState?.routes?.[driverTaskStackState.index];

                    const isOrderModalOpen = currentScreen?.name === 'OrderModal' && currentScreen?.params?.order?.id === orderId;

                    if (!isOnDriverTaskTab) {
                        tabNavigation.navigate('DriverTaskTab', { screen: 'DriverOrderManagement' });
                    }

                    if (!isOrderModalOpen) {
                        later(() => {
                            tabNavigation.navigate('DriverTaskTab', {
                                screen: 'OrderModal',
                                params: { order: order.serialize() },
                            });
                        }, 100);
                    } else {
                        console.log('[Navigation] Order modal already open for this order.');
                    }
                } catch (err) {
                    console.warn('Error navigating to order:', err);
                }
            }
        };

        addNotificationListener(handlePushNotification);

        return () => {
            removeNotificationListener(handlePushNotification);
        };
    }, [addNotificationListener, removeNotificationListener, fleetbase, tabNavigation, navigation]);

    return <View style={{ width: '100%', height: '100%', flex: 1 }}>{children}</View>;
};

export default DriverLayout;
