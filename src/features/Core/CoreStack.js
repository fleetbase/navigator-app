import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BootScreen from './screens/BootScreen';
// import MainScreen from './screens/MainScreen';
import MainStack from './MainStack';
import SearchScreen from './screens/SearchScreen';
import AuthStack from 'auth/AuthStack';
import { OrderScreenStack } from './OrdersStack';
import OrderScreen from 'shared/OrderScreen';
import EntityScreen from 'shared/EntityScreen';
import NavigationScreen from 'shared/NavigationScreen';
import ProofScreen from 'shared/ProofScreen';

const RootStack = createStackNavigator();

const CoreStack = ({ route }) => {
    return (
        <SafeAreaProvider>
            <RootStack.Navigator screenOptions={{ headerShown: false, animationEnabled: false, gestureEnabled: false }}>
                <RootStack.Group>
                    <RootStack.Screen name="BootScreen" component={BootScreen} initialParams={route.params ?? {}} />
                    <RootStack.Screen name="MainStack" component={MainStack} initialParams={route.params ?? {}} />
                    <RootStack.Screen name="LoginScreen" component={AuthStack} initialParams={route.params ?? {}} />
                    <RootStack.Screen name="OrdersScreen" component={OrderScreenStack} initialParams={route.params ?? {}} />
                </RootStack.Group>
            </RootStack.Navigator>
        </SafeAreaProvider>
    );
};

export default CoreStack;
