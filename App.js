/**
 * Navigator App for Fleetbase
 *
 * @format
 * @flow strict-local
 */

import { Link, NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import type { Node } from 'react';
import React, { useEffect } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import Config from 'react-native-config';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import Toast from 'react-native-toast-message';
import tailwind from 'tailwind';
import CoreStack from './src/features/Core/CoreStack';
import { get } from 'utils/Storage';
const Stack = createStackNavigator();

const App: () => Node = () => {
    const setFleetbaseConfig = (key, host) => {
        console.log(`Setting Fleetbase config: Key=${key}, Host=${host}`);

        return Config[key] && Config[host];
    };

    useEffect(async () => {
        console.log('Event: ', await Linking.getInitialURL());
        Linking.addEventListener('url', handleDeepLink);

        Linking.getInitialURL().then(url => {
            console.log('Initial URL: ', url);
            if (url) handleDeepLink({ url });
        });

        return () => {
            Linking.removeEventListener('url', handleDeepLink);
        };
    }, []);

    const handleDeepLink = event => {
        const urlParts = event.url.split('?');
        
        if (urlParts.length > 1) {
            const path = String(urlParts[0]).replace("flbnavigator://", '')
            
            if(path !== 'configure') return;

            const queryString = urlParts[1];
            const queryParams = queryString.split('&');

            const parsedParams = {};
            queryParams.forEach(param => {
                const [key, value] = param.split('=');
                parsedParams[key] = decodeURIComponent(value);
            });
            
            const { fleetbase_key, fleetbase_host } = parsedParams;
         
            setFleetbaseConfig(fleetbase_key, fleetbase_host);
        
            let _FLEETBASE_KEY = get('_FLEETBASE_KEY');
            let _FLEETBASE_HOST = get('_FLEETBASE_HOST');

            console.log('Set config: ', Config[key], Config[host], fleetbase_key, fleetbase_host);
        }
    };

    return (
        <>
            <NavigationContainer
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
                    <Stack.Screen name="CoreStack" component={CoreStack} options={{ headerShown: false, animationEnabled: false, gestureEnabled: false }} />
                </Stack.Navigator>
            </NavigationContainer>
            <Toast />
        </>
    );
};

export default App;
