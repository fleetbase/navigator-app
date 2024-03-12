import { createStackNavigator } from '@react-navigation/stack';
import React from 'react';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import EntityScreen from 'shared/EntityScreen';

import OrderScreen from 'shared/OrderScreen';
import ProofScreen from 'shared/ProofScreen';
import MainScreen from './screens/MainScreen';
import SearchScreen from './screens/SearchScreen';
import IssueScreen from './screens/IssueScreen';

const RootStack = createStackNavigator();

const MainStack = ({ route }) => {
    return (
        <SafeAreaProvider>
            <RootStack.Navigator>
                <RootStack.Group>
                    <RootStack.Screen
                        name="MainScreen"
                        component={MainScreen}
                        options={{ headerShown: false, animationEnabled: false, gestureEnabled: false }}
                        initialParams={route.params ?? {}}
                    />
                </RootStack.Group>
                <RootStack.Group screenOptions={{ presentation: 'modal' }}>
                    <RootStack.Screen name="OrderScreen" component={OrderScreen} options={{ headerShown: false }} initialParams={route.params ?? {}} />
                    <RootStack.Screen name="EntityScreen" component={EntityScreen} options={{ headerShown: false }} initialParams={route.params ?? {}} />
                    <RootStack.Screen name="ProofScreen" component={ProofScreen} options={{ headerShown: false }} initialParams={route.params ?? {}} />
                    <RootStack.Screen name="SearchScreen" component={SearchScreen} options={{ headerShown: false }} initialParams={route.params ?? {}} />
                    <RootStack.Screen name="IssueScreen" component={IssueScreen} options={{ headerShown: false }} initialParams={route.params ?? {}} />
                </RootStack.Group>
            </RootStack.Navigator>
        </SafeAreaProvider>
    );
};

export default MainStack;
