import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import type { Node } from 'react';
import React, { useEffect, useRef, useCallback } from 'react';
import { ActivityIndicator, Linking, Text, View, AppState } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import Toast from 'react-native-toast-message';
import tailwind from 'tailwind';
import { useDriver } from 'utils/Auth';
import { setString } from 'utils/Storage';
import { config } from './src/utils';

import CoreStack from './src/features/Core/CoreStack';

const Stack = createStackNavigator();

const linking = {
    prefixes: ['https://fleetbase.io', 'flbnavigator://', config('APP_LINK_PREFIX'), ...config('app.linkingPrefixes')].filter(Boolean),
    config: {
        screens: {},
    },
};

const App: () => Node = () => {
    const [setDriver] = useDriver();
    const navigationRef = useRef();

    const parseDeepLinkUrl = useCallback(url => {
        const urlParts = url.split('?');

        if (urlParts.length > 1) {
            const path = String(urlParts[0]).replace(/^[^:]+:\/\//, '');
            if (path !== 'configure') return;

            const queryString = urlParts[1];
            const queryParams = queryString.split('&');

            const parsedParams = {};
            queryParams.forEach(param => {
                const [key, value] = param.split('=');
                parsedParams[key] = decodeURIComponent(value);
            });

            return parsedParams;
        }

        return null;
    });

    const setFleetbaseConfig = useCallback((key, host) => {
        setString('_FLEETBASE_KEY', key);
        setString('_FLEETBASE_HOST', host);

        if (navigationRef.current) {
            setTimeout(() => {
                navigationRef.current.reset({
                    index: 0,
                    routes: [{ name: 'BootScreen' }],
                });
                setDriver(null);
            }, 600);
        }
    });

    useEffect(() => {
        const setupInstanceLink = ({ url }) => {
            console.log('setupInstanceLink() #url', url);
            const parsedParams = parseDeepLinkUrl(url);

            console.log('parsedParams----->', parsedParams);

            if (parsedParams !== null) {
                const { key, host } = parsedParams;
                setFleetbaseConfig(key, host);
            }
        };

        console.log('Linking:::::', Linking);

        Linking.addEventListener('url', ({ url }) => {
            console.log('URL EVENT FIRED!');
            setupInstanceLink({ url });
        });

        Linking.getInitialURL().then(url => {
            if (url) {
                setupInstanceLink({ url });
                console.log('initial url:::', url);
            }
        });

        return () => {
            console.log('App useEffect cleaned up');
            Linking.removeListeners('url', setupInstanceLink);
        };
    }, []);

    return (
        <>
            <NavigationContainer
                ref={navigationRef}
                linking={linking}
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
