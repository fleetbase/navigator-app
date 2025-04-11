import { createStackNavigator } from '@react-navigation/stack';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import EntityScreen from 'shared/EntityScreen';
import OrderScreen from 'shared/OrderScreen';
import ProofScreen from 'shared/ProofScreen';
import OrdersScreen from './screens/OrdersScreen';

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
                <RootStack.Group>
                    <RootStack.Screen
                        name='OrdersScreen'
                        component={OrdersScreen}
                        options={{ headerShown: false, animationEnabled: false, gestureEnabled: false }}
                        initialParams={route.params ?? {}}
                    />
                </RootStack.Group>
            </RootStack.Navigator>
        </SafeAreaProvider>
    );
};

const OrderScreenStack = ({ route }) => {
    return (
        <SafeAreaProvider>
            <OrderStack.Navigator options={{ presentation: 'modal' }} screenOptions={{ presentation: 'modal', headerShown: false, animationEnabled: false, gestureEnabled: false }}>
                <OrderStack.Screen name='OrderScreen' component={OrderScreen} options={{ headerShown: false }} initialParams={route.params ?? {}} />
                <OrderStack.Screen name='EntityScreen' component={EntityScreen} options={{ headerShown: false }} initialParams={route.params ?? {}} />
                <OrderStack.Screen name='ProofScreen' component={ProofScreen} options={{ headerShown: false }} initialParams={route.params ?? {}} />
            </OrderStack.Navigator>
        </SafeAreaProvider>
    );
};

export default OrdersStack;
export { OrderScreenStack };
