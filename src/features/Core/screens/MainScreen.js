import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { getUniqueId } from 'react-native-device-info';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faClipboardList, faUser, faRoute, faCalendarDay, faWallet } from '@fortawesome/free-solid-svg-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { EventRegister } from 'react-native-event-listeners';
import { getCurrentLocation } from 'utils/Geo';
import { useResourceStorage, get } from 'utils/Storage';
import { syncDevice } from 'utils/Auth';
import { logError, getColorCode } from 'utils';
import { tailwind } from 'tailwind';
import { useDriver } from 'hooks';
import useFleetbase from 'hooks/use-fleetbase';
// import BrowserStack from 'browser/BrowserStack';
// import CartStack from 'cart/CartStack';
import AccountStack from 'account/AccountStack';
import OrdersStack from 'core/OrdersStack';
import ScheduleStack from 'core/ScheduleStack';
import RoutesScreen from './RoutesScreen';
import WalletScreen from './WalletScreen';

const { addEventListener, removeEventListener } = EventRegister;
const Tab = createBottomTabNavigator();

const MainScreen = ({ navigation, route }) => {
    // const { info } = route.params;

    const fleetbase = useFleetbase();

    const [isRequestingPermission, setIsRequestingPermission] = useState(false);
    const [driver, setDriver] = useDriver();

    useEffect(() => {
        // Set location
        getCurrentLocation();

        // Sync device
        syncDevice(driver);

        // Listen for incoming remote notification events
        const watchNotifications = addEventListener('onNotification', (notification) => {
            const { data } = notification;
            const { id, type } = data;

            // if (type.startsWith('order_')) {
            //     // navigateToOrder(id);
            //     NavigationService.transitionToOrder(id);
            // }
        });

        return () => {
            removeEventListener(watchNotifications);
        };
    }, []);

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
                    return <FontAwesomeIcon icon={icon} size={size} color={focused ? getColorCode('text-blue-400') : getColorCode('text-gray-600')} />;
                },
            })}
            tabBarOptions={{
                style: tailwind('bg-gray-800 border-gray-700 shadow-lg'),
                tabStyle: tailwind('bg-gray-800 border-gray-700'),
                showLabel: false,
            }}
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
