import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ScheduleScreen from './screens/ScheduleScreen';
import OrderScreen from 'shared/OrderScreen';
import EntityScreen from 'shared/EntityScreen';

const RootStack = createStackNavigator();

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

const ScheduleStack = ({ route }) => {
    return (
        <SafeAreaProvider>
            <RootStack.Navigator screenOptions={{ headerShown: false, animationEnabled: false, gestureEnabled: false }}>
                <RootStack.Screen name='ScheduleScreen' component={ScheduleScreen} options={{ headerShown: false, animationEnabled: false, gestureEnabled: false }} />
                <RootStack.Screen name='OrderScreen' component={OrderScreen} options={{ headerShown: false, ...verticalAnimation }} />
                <RootStack.Screen name='EntityScreen' component={EntityScreen} options={{ headerShown: false, ...verticalAnimation }} />
            </RootStack.Navigator>
        </SafeAreaProvider>
    );
};

export default ScheduleStack;
