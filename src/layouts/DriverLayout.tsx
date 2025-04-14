import { useEffect } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { later } from '../utils';
import { useNotification } from '../contexts/NotificationContext';
import { useChat } from '../contexts/ChatContext';
import { useOrderManager } from '../contexts/OrderManagerContext';
import useFleetbase from '../hooks/use-fleetbase';

const getCurrentScreen = (tabNavigation) => {
    const tabState = tabNavigation.getState?.();
    const currentTabRoute = tabState?.routes?.[tabState.index];
    const stackState = currentTabRoute?.state;
    const currentScreen = stackState?.routes?.[stackState.index];

    return {
        tabName: currentTabRoute?.name,
        screenName: currentScreen?.name,
        screenParams: currentScreen?.params,
    };
};

const DriverLayout = ({ children, state, descriptors, navigation: tabNavigation }) => {
    const navigation = useNavigation();
    const { fleetbase } = useFleetbase();
    const { getChannel } = useChat();
    const { addNotificationListener, removeNotificationListener } = useNotification();
    const { reloadActiveOrders } = useOrderManager();

    useEffect(() => {
        if (!fleetbase) {
            return;
        }

        const handlePushNotification = async (notification, action) => {
            console.log('[Notification]', notification);
            console.log('[Notification #action]', action);
            const { payload } = notification;
            const id = payload.id;
            const type = payload.type;

            if (type === 'chat_message_received' && action === 'opened') {
                try {
                    const chatChannelId = payload.channel;
                    const channel = await getChannel(chatChannelId);
                    const { tabName, screenName, screenParams } = getCurrentScreen(tabNavigation);

                    const isOnDriverChatTab = tabName === 'DriverChatTab';
                    const isOnSameChatChannel = screenName === 'ChatChannel' && screenParams?.channel?.uuid === chatChannelId;

                    if (!isOnDriverChatTab) {
                        tabNavigation.navigate('DriverChatTab', { screen: 'ChatList' });
                    }

                    if (!isOnSameChatChannel) {
                        later(() => {
                            tabNavigation.navigate('DriverChatTab', {
                                screen: 'ChatChannel',
                                params: { channel },
                            });
                        }, 100);
                    } else {
                        console.log('[Navigation] Chat channel already open for this message.');
                    }
                } catch (err) {
                    console.warn('Error trying to open chat channel:', err);
                }
            }

            if (typeof id === 'string' && id.startsWith('order_')) {
                // Reload active orders
                reloadActiveOrders();

                try {
                    const order = await fleetbase.orders.findRecord(id);
                    const orderId = order.id;
                    const { tabName, screenName, screenParams } = getCurrentScreen(tabNavigation);

                    const isOnDriverTaskTab = tabName === 'DriverTaskTab';
                    const isOrderModalOpen = screenName === 'OrderModal' && screenParams?.order?.id === orderId;

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
