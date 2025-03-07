import { createStaticNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Boot } from './stacks/CoreStack';
import { LocationPermission } from './stacks/LocationStack';
import AuthStack from './stacks/AuthStack';
import DriverNavigator from './DriverNavigator';
import { useIsNotAuthenticated, useIsAuthenticated } from '../contexts/AuthContext';

const RootStack = createNativeStackNavigator({
    initialRouteName: 'Boot',
    screens: {
        Boot,
        LocationPermission,
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
