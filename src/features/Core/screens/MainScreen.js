import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, Platform, Linking } from 'react-native';
import { getUniqueId } from 'react-native-device-info';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faClipboardList, faUser, faRoute, faCalendarDay, faWallet } from '@fortawesome/free-solid-svg-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useRoute, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { EventRegister } from 'react-native-event-listeners';
import { getCurrentLocation, requestTrackingPermissions, trackDriver } from 'utils/Geo';
import { useResourceStorage, get } from 'utils/Storage';
import { syncDevice } from 'utils/Auth';
import { logError, getColorCode, config, toBoolean, listenForOrdersFromSocket, createNewOrderLocalNotificationObject } from 'utils';
import { Header } from 'components';
import { tailwind } from 'tailwind';
import { useDriver, useMountedState, useResourceCollection } from 'hooks';
import { format, startOfYear, endOfYear } from 'date-fns';
import { Order } from '@fleetbase/sdk';
import PushNotification from 'react-native-push-notification';
import useFleetbase from 'hooks/use-fleetbase';
import RNLocation from 'react-native-location';
import AccountStack from 'account/AccountStack';
import OrdersStack from 'core/OrdersStack';
import ScheduleStack from 'core/ScheduleStack';
import RoutesScreen from './RoutesScreen';
import WalletScreen from './WalletScreen';

const { addEventListener, removeEventListener } = EventRegister;
const Tab = createBottomTabNavigator();
const isAndroid = Platform.OS === 'android';

const MainScreen = ({ navigation, route }) => {
    // Setup
    const fleetbase = useFleetbase();
    const isMounted = useMountedState();
    const navigationRoute = useRoute();

    // State Management
    const [driver, setDriver] = useDriver();
    const [isOnline, setIsOnline] = useState(driver.isOnline);
    const [trackingSubscriptions, setTrackingSubscriptions] = useState([]);
    const [isPinged, setIsPinged] = useState(0);

    // Listen for push notifications for new orders
    const listenForNotifications = useCallback(() => {
        const notifications = addEventListener('onNotification', (notification) => {
            const { data, id } = notification;
            const { action } = data;

            console.log('[onNotification() #notification]', notification);
            console.log('[onNotification() #data]', data);
            console.log('[onNotification() #action]', action);

            if (typeof id === 'string' && id.startsWith('order')) {
                return fleetbase.orders.findRecord(id).then((order) => {
                    const data = order.serialize();

                    if (navigationRoute.name === 'MainScreen') {
                        navigation.navigate('OrderScreen', { data });
                    }
                });
            }
        });

        return notifications;
    });

    // Initialize when Component is Mounted
    // Get the user's current location
    // Sync the users device for the driver
    // Start listening for push notifications
    useEffect(() => {
        // Set location
        getCurrentLocation();

        // Sync device
        syncDevice(driver);

        // Listen for incoming remote notification events
        const notifications = listenForNotifications();

        return () => {
            removeEventListener(notifications);
        };
    }, [isMounted]);

    // Toggle driver location tracking
    useEffect(() => {
        // Start tracking the driver location
        if (isOnline) {
            trackDriver(driver)
                .then((unsubscribeFn) => {
                    setTrackingSubscriptions([...trackingSubscriptions, unsubscribeFn]);
                })
                .catch(logError);
        } else {
            // Unsubscribe to all tracking subscriptions in state
            trackingSubscriptions.forEach((unsubscribeFn) => {
                unsubscribeFn();
            });
        }
    }, [isOnline]);

    // Listen for Driver record update to update this screens localized isOnline state
    useEffect(() => {
        const driverUpdated = addEventListener('driver.updated', ({ isOnline }) => {
            setIsOnline(isOnline);
        });

        return () => {
            removeEventListener(driverUpdated);
        };
    }, [isMounted]);

    // Listen for new orders via Socket Connection
    useEffect(() => {
        listenForOrdersFromSocket(`driver.${driver.id}`, (order, event) => {
            if (typeof event === 'string' && event === 'order.ready') {
                let localNotificationObject = createNewOrderLocalNotificationObject(order, driver);
                PushNotification.localNotification(localNotificationObject);
            }
        });
    }, []);

    return (
        <>
            <Tab.Navigator
                screenOptions={({ route }) => ({
                    tabBarIcon: ({ focused, size }) => {
                        let icon;
                        switch (route.name) {
                            case 'Orders':
                                icon = faClipboardList;
                                break;
                            case 'Routes':
                                icon = faRoute;
                                break;
                            case 'Schedule':
                                icon = faCalendarDay;
                                break;
                            case 'Wallet':
                                icon = faWallet;
                                break;
                            case 'Account':
                                icon = faUser;
                                break;
                        }
                        // You can return any component that you like here!
                        return <FontAwesomeIcon icon={icon} size={isAndroid ? 23 : size} color={focused ? getColorCode('text-blue-400') : getColorCode('text-gray-600')} />;
                    },
                    tabBarStyle: tailwind('bg-gray-800 border-gray-700 shadow-lg'),
                    tabBarItemStyle: tailwind(`bg-gray-800 border-gray-700 ${isAndroid ? 'py-1' : 'pt-1.5'}`),
                    tabBarActiveTintColor: getColorCode('text-blue-400'),
                    tabBarInactiveTintColor: getColorCode('text-gray-600'),
                    showLabel: false,
                    headerShown: true,
                    header: ({ navigation, route, options }) => {
                        return <Header navigation={navigation} route={route} options={options} />;
                    },
                })}
            >
                <Tab.Screen key="orders" name="Orders" component={OrdersStack} />
                {/* <Tab.Screen key="routes" name="Routes" component={RoutesScreen} /> */}
                {/* <Tab.Screen key="schedule" name="Schedule" component={ScheduleStack} /> */}
                {/* <Tab.Screen key="wallet" name="Wallet" component={WalletScreen} /> */}
                <Tab.Screen key="account" name="Account" component={AccountStack} />
            </Tab.Navigator>
        </>
    );
};

export default MainScreen;
