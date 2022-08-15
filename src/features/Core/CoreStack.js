import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BootScreen from './screens/BootScreen';
import MainScreen from './screens/MainScreen';
import SearchScreen from './screens/SearchScreen';
import AuthStack from 'auth/AuthStack';
import { OrderScreenStack } from './OrdersStack';

const RootStack = createStackNavigator();

const CoreStack = ({ route }) => {
    return (
        <SafeAreaProvider>
            <RootStack.Navigator screenOptions={{ headerShown: false, animationEnabled: false, gestureEnabled: false }}>
                <RootStack.Group>
                    <RootStack.Screen name="BootScreen" component={BootScreen} />
                    <RootStack.Screen name="MainScreen" component={MainScreen} />
                    <RootStack.Screen name="LoginScreen" component={AuthStack} />
                    <RootStack.Screen name="OrdersScreen" component={OrderScreenStack} initialParams={route.params ?? {}} />
                </RootStack.Group>
            </RootStack.Navigator>
        </SafeAreaProvider>
    );
};

export default CoreStack;
