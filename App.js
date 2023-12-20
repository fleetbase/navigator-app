import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useFleetbase } from 'hooks';
import type { Node } from 'react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import Toast from 'react-native-toast-message';
import tailwind from 'tailwind';
import { useDriver } from 'utils/Auth';
import { setString } from 'utils/Storage';
import { config } from './src/utils';

import { useNetInfo } from '@react-native-community/netinfo';
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
    const [isLoading, setLoading] = useState(true);
    const fleetbase = useFleetbase();
    const { isConnected } = useNetInfo();

    useEffect(() => {
        if (isConnected) {
            // const orders = JSON.parse(getString('_ORDER'));
            // orders.forEach(order => {
            //     // const order = {
            //     //     orderParams: params,
            //     //     action: 'start',
            //     //     time: currentDate,
            //     // };
            //     emit('order', order);
            
            // });
        }
    }, [isConnected]);

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

    const setFleetbaseConfig = useCallback(async (key, host) => {
        return await new Promise(() => {
            setString('_FLEETBASE_KEY', key);
            setString('_FLEETBASE_HOST', host);

            if (navigationRef.current) {
                navigationRef.current.reset({
                    index: 0,
                    routes: [{ name: 'BootScreen' }],
                });
                setDriver(null);
                setLoading(false);
            }
        });
    });

    const showLoader = (isLoading => {
        return (
            <View style={tailwind('bg-gray-800 flex items-center justify-center w-full h-full')}>
                <View style={tailwind('flex items-center justify-center')}>
                    <ActivityIndicator style={tailwind('mb-4')} isLoading={isLoading} />
                </View>
            </View>
        );
    })();

    useEffect(() => {
        const setupInstanceLink = ({ url }) => {
            console.log('setupInstanceLink() #url', url);

            const parsedParams = parseDeepLinkUrl(url);

            if (parsedParams !== null) {
                const { key, host } = parsedParams;

                setFleetbaseConfig(key, host);
                fleetbase.organizations.current().then(res => {
                    setString('_BRANDING_LOGO', res.branding.logo_url);
                    setString('_LOGO', res.logo_url);
                    console.log('Organization: ', res);
                });
                
                Toast.show({
                    type: 'success',
                    text1: `Linking to instance ${host}`,
                    text2: 'Navigator app linked successfully',
                });
            }
        };

        Linking.addEventListener('url', ({ url }) => {
            console.log('URL EVENT FIRED!', url);
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
            Linking.removeEventListener('url', setupInstanceLink);
        };
    }, []);

    return (
        <>
            <NavigationContainer ref={navigationRef} linking={linking} fallback={showLoader}>
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
