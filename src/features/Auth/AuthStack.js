import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// import AccountScreen from './screens/AccountScreen';
import LoginScreen from 'auth/screens/LoginScreen';
import CreateAccountScreen from 'auth/screens/CreateAccountScreen';

const RootStack = createStackNavigator();

const AuthStack = ({ route }) => {
    return (
        <SafeAreaProvider>
            <RootStack.Navigator screenOptions={{ presentation: 'modal' }}>
                {/* <RootStack.Screen name="AccountScreen" component={AccountScreen} options={{ headerShown: false }} initialParams={{ info }} /> */}
                <RootStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
                <RootStack.Screen name="CreateAccount" component={CreateAccountScreen} options={{ headerShown: false }} />
            </RootStack.Navigator>
        </SafeAreaProvider>
    );
};

export default AuthStack;
