import { useEffect } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { loadPersistedResource } from '../utils';
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
            console.log('[PushNotification]', notification);
            const { payload } = notification;
            const id = payload.id;
            const type = payload.type;

            if (typeof id === 'string' && id.startsWith('order_')) {
                try {
                    const order = await fleetbase.orders.findRecord(id);
                    tabNavigation.navigate('DriverTaskTab', { screen: 'Order', params: { order: order.serialize() } });
                } catch (err) {
                    console.warn('Error navigating to order:', err);
                }
            }
        };

        addNotificationListener(handlePushNotification);

        return () => {
            removeNotificationListener(handlePushNotification);
        };
    }, [addNotificationListener, removeNotificationListener, fleetbase]);

    return <View style={{ width: '100%', height: '100%', flex: 1 }}>{children}</View>;
};

export default DriverLayout;
