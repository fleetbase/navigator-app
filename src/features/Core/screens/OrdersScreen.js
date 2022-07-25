import React, { useEffect, useState, useCallback } from 'react';
import { SafeAreaView, ScrollView, View, Text, Dimensions, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faSatelliteDish } from '@fortawesome/free-solid-svg-icons';
import { EventRegister } from 'react-native-event-listeners';
import { useDriver, useMountedState, useResourceCollection, useFleetbase } from 'hooks';
import { logError, getColorCode, isArray, pluralize, formatDuration, formatKm, getActiveOrdersCount, getTotalStops, getTotalDuration, getTotalDistance } from 'utils';
import { setI18nConfig } from 'utils/Localize';
import { tailwind } from 'tailwind';
import { format } from 'date-fns';
import { Order } from '@fleetbase/sdk';
import DefaultHeader from 'ui/headers/DefaultHeader';
import OrdersFilterBar from 'ui/OrdersFilterBar';
import OrderCard from 'ui/OrderCard';
import SimpleOrdersMetrics from 'ui/SimpleOrdersMetrics';
import config from 'config';

const { addEventListener, removeEventListener } = EventRegister;
const REFRESH_NEARBY_ORDERS_MS = 6000 * 5; // 5 mins

const OrdersScreen = ({ navigation }) => {
    const isMounted = useMountedState();
    const fleetbase = useFleetbase();
    const [driver, setDriver] = useDriver();

    const [date, setDateValue] = useState(new Date());
    const [params, setParams] = useState({
        driver: driver?.id,
        on: format(date, 'dd-MM-yyyy'),
        sort: '-created_at',
    });
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isQuerying, setIsQuerying] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [orders, setOrders] = useResourceCollection(`orders_${format(date, 'yyyyMMdd')}`, Order, fleetbase.getAdapter());
    const [nearbyOrders, setNearbyOrders] = useState([]);
    const [searchingForNearbyOrders, setSearchingForNearbyOrders] = useState(false);

    const unauthenticate = useCallback((error) => {
        const isThrownError = error instanceof Error && error?.message?.includes('Unauthenticated');
        const isErrorMessage = typeof error === 'string' && error.includes('Unauthenticated');

        logError(error);

        if (isThrownError || isErrorMessage) {
            navigation.reset({
                index: 0,
                routes: [{ name: 'BootScreen' }],
            });
            setDriver(null);
        }
    });

    const setParam = (key, value) => {
        if (key === 'on') {
            setDateValue(value);
            value = format(value, 'dd-MM-yyyy');
        }

        params[key] = value;
        setParams(params);
    };

    const loadOrders = useCallback((options = {}) => {
        if (options.isRefreshing) {
            setIsRefreshing(true);
        }

        if (options.isQuerying) {
            setIsQuerying(true);
        }

        return fleetbase.orders
            .query(params)
            .then(setOrders)
            .catch(unauthenticate)
            .finally(() => {
                setIsRefreshing(false);
                setIsQuerying(false);
                setIsLoaded(true);
            });
    });

    useFocusEffect(
        useCallback(() => {
            const scanForNearbyOrders = () => {
                if (searchingForNearbyOrders === true) {
                    return;
                }

                setSearchingForNearbyOrders(true);

                fleetbase.orders
                    .query({ nearby: driver.id, adhoc: 1, unassigned: 1, status: 'active' })
                    .then((orders) => {
                        setNearbyOrders(orders);
                    })
                    .catch(logError)
                    .finally(() => {
                        setSearchingForNearbyOrders(false);
                    });
            };

            scanForNearbyOrders();
            const interval = setInterval(scanForNearbyOrders, REFRESH_NEARBY_ORDERS_MS);

            return () => clearInterval(interval);
        }, [isMounted])
    );

    useEffect(() => {
        loadOrders({ isQuerying: isLoaded });
    }, [isMounted, date]);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            loadOrders();
        });

        return unsubscribe;
    }, [isMounted]);

    useEffect(() => {
        const notifications = addEventListener('onNotification', () => loadOrders({ isQuerying: true }));

        return () => {
            removeEventListener(notifications);
        };
    }, [isMounted]);

    return (
        <View style={[tailwind('bg-gray-800 h-full')]}>
            <DefaultHeader
                onSearchResultPress={(order, closeDialog) => {
                    closeDialog();
                    navigation.push('OrderScreen', { data: order.serialize() });
                }}
            >
                <OrdersFilterBar
                    onSelectSort={(sort) => setParam('sort', sort)}
                    onSelectFilter={(filters) => setParam('filter', filters)}
                    onSelectDate={(date) => setParam('on', date)}
                    isLoading={isQuerying}
                    containerStyle={tailwind('px-0 pb-0')}
                />
                <SimpleOrdersMetrics orders={orders} date={date} containerClass={tailwind('px-0')} />
            </DefaultHeader>
            <ScrollView
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => loadOrders({ isRefreshing: true })} tintColor={getColorCode('text-blue-200')} />}
                stickyHeaderIndices={[1]}
                style={tailwind('w-full h-full')}
            >
                {searchingForNearbyOrders && (
                    <View style={tailwind('px-4 py-3 bg-yellow-50')}>
                        <View style={tailwind('flex-row items-center')}>
                            <ActivityIndicator color={getColorCode('text-yellow-900')} style={tailwind('mr-2')} />
                            <Text style={tailwind('text-yellow-900 font-bold text-sm')}>Searching for nearby orders...</Text>
                        </View>
                    </View>
                )}
                {nearbyOrders.length > 0 && (
                    <View style={tailwind('mb-2 px-4 py-3 bg-yellow-50')}>
                        <View>
                            <View style={tailwind('mb-4 flex-row items-center')}>
                                <FontAwesomeIcon icon={faSatelliteDish} color={getColorCode('text-yellow-900')} style={tailwind('mr-2')} />
                                <Text style={tailwind('text-yellow-900 font-bold text-lg')}>Nearby orders found</Text>
                            </View>
                            {nearbyOrders.map((order, index) => (
                                <View
                                    key={index}
                                    style={[
                                        tailwind('border border-yellow-300 bg-yellow-100 rounded-sm'),
                                        {
                                            shadowOffset: { width: 0, height: 0 },
                                            shadowOpacity: 0.3,
                                            shadowRadius: 5,
                                            shadowColor: 'rgba(252, 211, 77, 1)',
                                            marginBottom: nearbyOrders.length > 1 ? 12 : 8,
                                        },
                                    ]}
                                >
                                    <OrderCard
                                        headerTop={
                                            <View style={tailwind('pt-3 pb-2 px-3')}>
                                                <Text style={tailwind('text-yellow-900 font-semibold')}>Order ready for pickup {order.getAttribute('distance')} meters away!</Text>
                                            </View>
                                        }
                                        order={order}
                                        wrapperStyle={tailwind('p-0')}
                                        containerStyle={tailwind('border-0 shadow-none rounded-none bg-yellow-100')}
                                        headerStyle={tailwind('border-yellow-300 py-0 pb-3')}
                                        textStyle={tailwind('text-yellow-900')}
                                        orderIdStyle={tailwind('text-yellow-900')}
                                        onPress={() => navigation.push('OrderScreen', { data: order.serialize() })}
                                    />
                                </View>
                            ))}
                        </View>
                    </View>
                )}
                <View style={tailwind('w-full h-full mt-2')}>
                    {orders.map((order, index) => (
                        <OrderCard key={index} order={order} onPress={() => navigation.push('OrderScreen', { data: order.serialize() })} />
                    ))}
                </View>
                <View style={tailwind('h-96 w-full')} />
            </ScrollView>
        </View>
    );
};

export default OrdersScreen;
