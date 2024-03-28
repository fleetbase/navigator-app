import { Order, lookup } from '@fleetbase/sdk';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useFleetbase } from 'hooks';
import type { Node } from 'react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import Toast from 'react-native-toast-message';
import { EventRegister } from 'react-native-event-listeners';
import tailwind from 'tailwind';
import { useDriver } from 'utils/Auth';
import { getString, setString } from 'utils/Storage';
import { config, isArray, capitalize, logError } from './src/utils';
import { useNetInfo } from '@react-native-community/netinfo';
import CoreStack from './src/features/Core/CoreStack';

const Stack = createStackNavigator();

const linking = {
    prefixes: ['https://fleetbase.io', 'flbnavigator://', config('APP_LINK_PREFIX'), ...config('app.linkingPrefixes')].filter(Boolean),
    config: {
        screens: {},
    },
};

const success = [];

const { emit } = EventRegister;

const App: () => Node = () => {
    const [setDriver] = useDriver();
    const navigationRef = useRef();
    const [isLoading, setLoading] = useState(true);
    const fleetbase = useFleetbase();
    const { type, isConnected, isInternetReachable } = useNetInfo();

    useEffect(() => {
        const apiRequestQueue = JSON.parse(getString('apiRequestQueue'));
        console.log('#apiRequestQueue', JSON.stringify(apiRequestQueue));
        if (!isConnected || !isArray(apiRequestQueue) || apiRequestQueue.length === 0) {
            return;
        }

        if (apiRequestQueue.length > 0) {
            Toast.show({
                type: 'success',
                text1: `Activity syncing...`,
            });
        }

        const adapter = fleetbase.getAdapter();
        const adapterMethods = ['get', 'put', 'patch', 'post', 'delete'];

        const trackSuccess = response => {
            if (response instanceof Order) {
                emit('order.synced', response);
            }
        };

        for (let i = 0; i < apiRequestQueue.length; i++) {
            const apiRequest = apiRequestQueue[i];
            const { method, resource, resourceType, endpoint, params } = apiRequest;
            if (adapterMethods.includes(method)) {
                adapter[method](endpoint, params).then(trackSuccess);
                continue;
            }
            console.log('#queuedApiRequest', JSON.stringify({ method, resourceType, endpoint, params }));
            const resourceInstance = lookup('resource', capitalize(resourceType), resource, fleetbase.getAdapter());
            console.log('#resourceInstance', JSON.stringify(resourceInstance));
            if (resourceInstance) {
                console.log('#resourceInstance ID', resourceInstance.id);
                console.log('#resourceInstance method', method, typeof resourceInstance[method]);
                if (typeof resourceInstance[method] === 'function') {
                    resourceInstance[method](params).then(trackSuccess).catch(logError);
                }
                continue;
            }
        }

        setString('apiRequestQueue', JSON.stringify([]));
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

    const setFleetbaseConfig = useCallback(async (key, host, socketcluster_host, socketcluster_port) => {
        return await new Promise(() => {
            setString('_FLEETBASE_KEY', key);
            setString('_FLEETBASE_HOST', host);
            setString('_SOCKET_HOST', socketcluster_host);
            setString('_SOCKET_PORT', socketcluster_port);

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

    useEffect(() => {
        const setupInstanceLink = ({ url }) => {
            console.log('setupInstanceLink() #url', url);

            const parsedParams = parseDeepLinkUrl(url);

            if (parsedParams !== null) {
                const { key, host, socketcluster_host, socketcluster_port } = parsedParams;

                setFleetbaseConfig(key, host, socketcluster_host, socketcluster_port);
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
            // Linking.removeEventListener('url', setupInstanceLink);
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
                    <Stack.Screen name="CoreStack" component={CoreStack} options={{ headerShown: false, animationEnabled: false, gestureEnabled: false }} />
                </Stack.Navigator>
            </NavigationContainer>
            <Toast />
        </>
    );
};

export default App;
