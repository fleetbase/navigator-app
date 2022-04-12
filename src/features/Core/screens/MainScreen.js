import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, Platform } from 'react-native';
import { getUniqueId } from 'react-native-device-info';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faClipboardList, faUser, faRoute, faCalendarDay, faWallet } from '@fortawesome/free-solid-svg-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { EventRegister } from 'react-native-event-listeners';
import { getCurrentLocation, requestTrackingPermissions, trackDriver } from 'utils/Geo';
import { useResourceStorage, get } from 'utils/Storage';
import { syncDevice } from 'utils/Auth';
import { logError, getColorCode, isFalsy } from 'utils';
import { tailwind } from 'tailwind';
import { useDriver, useMountedState } from 'hooks';
import useFleetbase from 'hooks/use-fleetbase';
import RNLocation from 'react-native-location';
import AccountStack from 'account/AccountStack';
import OrdersStack from 'core/OrdersStack';
import ScheduleStack from 'core/ScheduleStack';
import RoutesScreen from './RoutesScreen';
import WalletScreen from './WalletScreen';

const { addEventListener, removeEventListener } = EventRegister;
const Tab = createBottomTabNavigator();

const isTruthy = (mixed) => !isFalsy(mixed);
const isAndroid = Platform.OS === 'android';

const MainScreen = ({ navigation, route }) => {
    const fleetbase = useFleetbase();
    const isMounted = useMountedState();

    const [driver, setDriver] = useDriver();
    const [isOnline, setIsOnline] = useState(isTruthy(driver?.getAttribute('online')));
    const [tracking, setTracking] = useState(0);

    const unauthenticate = useCallback((error) => {
        const isThrownError = error instanceof Error && error?.message?.includes('Unauthenticated');
        const isErrorMessage = typeof error === 'string' && error.includes('Unauthenticated');

        logError(error);

        if (isThrownError || isErrorMessage) {
            navigation.reset({
                index: 0,
                routes: [{ name: 'BootScreen' }],
            });
            setDriver(null);
        }
    });

    useEffect(() => {
        // set location
        getCurrentLocation();

        // sync device
        syncDevice(driver);

        // Listen for incoming remote notification events
        const notifications = addEventListener('onNotification', (notification) => {
            const { data, id } = notification;
            const { action } = data;

            if (action?.action === 'view_order' && id) {
                return fleetbase.orders.findRecord(id).then((order) => {
                    navigation.push('OrderScreen', { data: order.serialize() });
                });
            }
        });

        return () => {
            removeEventListener(notifications);
        };
    }, [isMounted]);

    // track driver location
    useEffect(() => {
        if (!isOnline) {
            return;
        }

        trackDriver(driver)
            .then(({ unsubscribe }) => {
                setTracking({ unsubscribe });
            })
            .catch(unauthenticate);
    }, [isMounted]);

    // toggle driver location tracking
    useEffect(() => {
        const shouldUnsubscribe = !isOnline && typeof tracking?.unsubscribe === 'function';
        const shouldSubscribe = isOnline && tracking?.unsubscribe === null;

        if (shouldUnsubscribe) {
            tracking.unsubscribe();
            setTracking({ unsubscribe: null });
        }

        if (shouldSubscribe) {
            trackDriver(driver)
                .then(({ unsubscribe }) => {
                    setTracking({ unsubscribe });
                })
                .catch(unauthenticate);
        }
    }, [isOnline]);

    // track driver online/offline
    useEffect(() => {
        const driverUpdated = addEventListener('driver.updated', (driver) => {
            if (driver === null && typeof tracking?.unsubscribe === 'function') {
                tracking.unsubscribe();
            }

            setIsOnline(isTruthy(driver?.getAttribute('online')));
        });

        return () => {
            removeEventListener(driverUpdated);
        };
    }, [isMounted]);

    return (
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
                headerShown: false,
            })}
        >
            <Tab.Screen key="orders" name="Orders" component={OrdersStack} />
            <Tab.Screen key="routes" name="Routes" component={RoutesScreen} />
            <Tab.Screen key="schedule" name="Schedule" component={ScheduleStack} />
            {/* <Tab.Screen key="wallet" name="Wallet" component={WalletScreen} /> */}
            <Tab.Screen key="account" name="Account" component={AccountStack} />
        </Tab.Navigator>
    );
};

export default MainScreen;
