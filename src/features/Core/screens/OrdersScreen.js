import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, Dimensions, RefreshControl } from 'react-native';
import { useDriver, useMountedState, useResourceCollection } from 'hooks';
import { logError, getColorCode, isArray, pluralize, formatDuration, formatKm, getActiveOrdersCount, getTotalStops, getTotalDuration, getTotalDistance } from 'utils';
import useFleetbase, { adapter as FleetbaseAdapter } from 'hooks/use-fleetbase';
import { setI18nConfig } from 'utils/Localize';
import { tailwind } from 'tailwind';
import { format } from 'date-fns';
import { Order } from '@fleetbase/sdk';
import DefaultHeader from 'ui/headers/DefaultHeader';
import OrdersFilterBar from 'ui/OrdersFilterBar';
import OrderCard from 'ui/OrderCard';
import SimpleOrdersMetrics from 'ui/SimpleOrdersMetrics';
import config from 'config';

const OrdersScreen = ({ navigation }) => {
    const isMounted = useMountedState();
    const fleetbase = useFleetbase();
    const [driver] = useDriver();

    const [date, setDateValue] = useState(new Date());
    const [params, setParams] = useState({
        driver: driver?.id,
        on: format(date, 'dd-MM-yyyy'),
        sort: '-created_at',
    });
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isQuerying, setIsQuerying] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [orders, setOrders] = useResourceCollection(`orders_${format(date, 'yyyyMMdd')}`, Order, FleetbaseAdapter);

    const setParam = (key, value) => {
        if (key === 'on') {
            setDateValue(value);
            value = format(value, 'dd-MM-yyyy');
        }

        params[key] = value;
        setParams(params);
    };

    const loadOrders = (options = {}) => {
        if (options.isRefreshing) {
            setIsRefreshing(true);
        }

        if (options.isQuerying) {
            setIsQuerying(true);
        }

        return fleetbase.orders
            .query(params)
            .then(setOrders)
            .catch(logError)
            .finally(() => {
                setIsRefreshing(false);
                setIsQuerying(false);
                setIsLoaded(true);
            });
    };

    useEffect(() => {
        loadOrders({ isQuerying: isLoaded });
    }, [isMounted, date]);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            loadOrders();
        });

        return unsubscribe;
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
                <View style={tailwind('w-full h-full mt-2')}>
                    {orders.map((order, index) => (
                        <OrderCard key={index} order={order} onPress={() => navigation.push('OrderScreen', { data: order.serialize() })} />
                    ))}
                </View>
            </ScrollView>
        </View>
    );
};

export default OrdersScreen;
