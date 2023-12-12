import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import type { Node } from 'react';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import Toast from 'react-native-toast-message';
import tailwind from 'tailwind';
import { useDriver } from 'utils/Auth';
import { getString, setString } from 'utils/Storage';

import CoreStack from './src/features/Core/CoreStack';

const Stack = createStackNavigator();

const App: () => Node = () => {
    const [driver, setDriver] = useDriver();
    const navigationRef = useRef();

    useEffect(async () => {
        console.log('Event: ', await Linking.getInitialURL());
        Linking.addEventListener('url', handleDeepLink);

        Linking.getInitialURL().then(url => {
            if (url) handleDeepLink({ url });
        });

        return () => {
            Linking.removeEventListener('url', handleDeepLink);
        };
    }, []);

    const setFleetbaseConfig = (key, host) => {
        setString('_FLEETBASE_KEY', key);
        setString('_FLEETBASE_HOST', host);

        if (navigationRef.current) {
            setTimeout(() => {
                // is key and host for instance stored
                navigationRef.current.reset({
                    index: 0,
                    routes: [{ name: 'BootScreen' }],
                });
                setDriver(null);
            }, 300);
        }
    };

    const handleDeepLink = event => {
        const urlParts = event.url.split('?');

        if (urlParts.length > 1) {
            const path = String(urlParts[0]).replace('flbnavigator://', '');
            if (path !== 'configure') return;

            const queryString = urlParts[1];
            const queryParams = queryString.split('&');

            const parsedParams = {};
            queryParams.forEach(param => {
                const [key, value] = param.split('=');
                parsedParams[key] = decodeURIComponent(value);
            });

            const { key, host } = parsedParams;

            setFleetbaseConfig(key, host);
        }
    };

    return (
        <>
            <NavigationContainer
                ref={navigationRef}
                linking={handleDeepLink}
                fallback={
                    <View style={tailwind('bg-gray-800 flex items-center justify-center w-full h-full')}>
                        <View style={tailwind('flex items-center justify-center')}>
                            <ActivityIndicator style={tailwind('mb-4')} />
                            <Text style={tailwind('text-gray-400')}>Loading...</Text>
                        </View>
                    </View>
                }>
                <Stack.Navigator>
                    <Stack.Screen
                        name="CoreStack"
                        component={CoreStack}
                        options={{
                            headerShown: false,
                            animationEnabled: false,
                            gestureEnabled: false,
                        }}
                    />
                </Stack.Navigator>
            </NavigationContainer>
            <Toast />
        </>
    );
};

export default App;
