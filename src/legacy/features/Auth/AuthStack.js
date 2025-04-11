import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from 'auth/screens/LoginScreen';
import CreateAccountScreen from 'auth/screens/CreateAccountScreen';
import ConfigScreen from '../Shared/ConfigScreen';
import SignUpScreen from './screens/SignUpScreen';
import OrganizationSearchScreen from './screens/OrganizationSearchScreen';

const RootStack = createStackNavigator();

const AuthStack = ({ route }) => {
    return (
        <SafeAreaProvider>
            <RootStack.Navigator screenOptions={{ presentation: 'modal' }}>
                <RootStack.Screen name='Login' component={LoginScreen} options={{ headerShown: false }} />
                <RootStack.Screen name='CreateAccount' component={CreateAccountScreen} options={{ headerShown: false }} />
                <RootStack.Screen name='SignUp' component={SignUpScreen} options={{ headerShown: false }} />
                <RootStack.Screen name='OrganizationSearchScreen' component={OrganizationSearchScreen} options={{ headerShown: false }} />
                <RootStack.Screen name='ConfigScreen' component={ConfigScreen} options={{ headerShown: false }} />
            </RootStack.Navigator>
        </SafeAreaProvider>
    );
};

export default AuthStack;
