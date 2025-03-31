import { createStaticNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Boot, LocationPermission, InstanceLink } from './stacks/CoreStack';
import AuthStack from './stacks/AuthStack';
import DriverNavigator from './DriverNavigator';
import { useIsNotAuthenticated, useIsAuthenticated } from '../contexts/AuthContext';
import AppLayout from '../layouts/AppLayout';

const RootStack = createNativeStackNavigator({
    initialRouteName: 'Boot',
    layout: AppLayout,
    screens: {
        Boot,
        LocationPermission,
        InstanceLink,
        ...AuthStack,
        DriverNavigator: {
            if: useIsAuthenticated,
            screen: DriverNavigator,
            options: { headerShown: false, gestureEnabled: false, animation: 'none' },
        },
    },
});

const AppNavigator = createStaticNavigation(RootStack);
export default AppNavigator;
