import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BootScreen from './screens/BootScreen';
import MainScreen from './screens/MainScreen';
import AuthStack from 'auth/AuthStack';
import { OrderScreenStack } from './OrdersStack';

const RootStack = createStackNavigator();

const CoreStack = ({ route }) => {
    return (
        <SafeAreaProvider>
            <RootStack.Navigator>
                <RootStack.Screen name="BootScreen" component={BootScreen} options={{ headerShown: false, animationEnabled: false, gestureEnabled: false }} />
                <RootStack.Screen name="MainScreen" component={MainScreen} options={{ headerShown: false, animationEnabled: false, gestureEnabled: false }} />
                <RootStack.Screen name="LoginScreen" component={AuthStack} options={{ headerShown: false, animationEnabled: false, gestureEnabled: false }} />
                <RootStack.Screen name="OrderScreen" component={OrderScreenStack} options={{ headerShown: false, animationEnabled: false, gestureEnabled: false }} />
            </RootStack.Navigator>
        </SafeAreaProvider>
    );
};

export default CoreStack;
