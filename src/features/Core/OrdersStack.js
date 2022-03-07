import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import OrdersScreen from './screens/OrdersScreen';
import OrderScreen from 'shared/OrderScreen';
import EntityScreen from 'shared/EntityScreen';
import NavigationScreen from 'shared/NavigationScreen';
import ProofScreen from 'shared/ProofScreen';

const RootStack = createStackNavigator();
const OrderStack = createStackNavigator();

const verticalAnimation = {
    gestureDirection: 'vertical',
    cardStyleInterpolator: ({ current, layouts }) => {
        return {
            cardStyle: {
                transform: [
                    {
                        translateY: current.progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [layouts.screen.height, 0],
                        }),
                    },
                ],
            },
        };
    },
};

const OrdersStack = ({ route }) => {
    return (
        <SafeAreaProvider>
            <RootStack.Navigator>
                <RootStack.Screen name="OrdersScreen" component={OrdersScreen} options={{ headerShown: false, animationEnabled: false, gestureEnabled: false }} initialParams={route.params ?? {}} />
                <RootStack.Screen name="OrderScreen" component={OrderScreen} options={{ headerShown: false, ...verticalAnimation }} initialParams={route.params ?? {}} />
                <RootStack.Screen name="EntityScreen" component={EntityScreen} options={{ headerShown: false, ...verticalAnimation }} initialParams={route.params ?? {}} />
                <RootStack.Screen name="NavigationScreen" component={NavigationScreen} options={{ headerShown: false, ...verticalAnimation }} initialParams={route.params ?? {}} />
                <RootStack.Screen name="ProofScreen" component={ProofScreen} options={{ headerShown: false, ...verticalAnimation }} initialParams={route.params ?? {}} />
            </RootStack.Navigator>
        </SafeAreaProvider>
    );
};

const OrderScreenStack = ({ route }) => {
    return (
        <SafeAreaProvider>
            <OrderStack.Navigator mode="modal">
                <OrderStack.Screen name="OrderScreen" component={OrderScreen} options={{ headerShown: false, ...verticalAnimation }} initialParams={route.params ?? {}} />
                <OrderStack.Screen name="EntityScreen" component={EntityScreen} options={{ headerShown: false, ...verticalAnimation }} initialParams={route.params ?? {}} />
                <OrderStack.Screen name="NavigationScreen" component={NavigationScreen} options={{ headerShown: false, ...verticalAnimation }} initialParams={route.params ?? {}} />
                <OrderStack.Screen name="ProofScreen" component={ProofScreen} options={{ headerShown: false, ...verticalAnimation }} initialParams={route.params ?? {}} />
            </OrderStack.Navigator>
        </SafeAreaProvider>
    );
}

export default OrdersStack;
export { OrderScreenStack };
