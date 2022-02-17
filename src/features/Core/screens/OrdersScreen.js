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
import config from 'config';

const OrdersScreen = ({ navigation }) => {
    const isMounted = useMountedState();
    const fleetbase = useFleetbase();
    const [driver] = useDriver();

    const [date, setDateValue] = useState(new Date());
    const [params, setParams] = useState({
        driver: driver.id,
        on: format(date, 'dd-MM-yyyy'),
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

    const onRefresh = () => {
        setIsRefreshing(true);

        fleetbase.orders
            .query(params)
            .then(setOrders)
            .catch(logError)
            .finally(() => setIsRefreshing(false));
    };

    useEffect(() => {
        if (isLoaded) {
            setIsQuerying(true);
        }

        fleetbase.orders
            .query(params)
            .then(setOrders)
            .catch(logError)
            .finally(() => {
                setIsQuerying(false);
                setIsLoaded(true);
            });
    }, [isMounted, date]);

    return (
        <View style={[tailwind('bg-gray-800 h-full'), { paddingBottom: 147 }]}>
            <DefaultHeader>
                <OrdersFilterBar
                    onSelectSort={(sort) => setParam('sort', sort)}
                    onSelectFilter={(filters) => setParam('filter', filter)}
                    onSelectDate={(date) => setParam('on', date)}
                    isLoading={isQuerying}
                    containerStyle={tailwind('px-0 pb-0')}
                />
            </DefaultHeader>
            <View style={tailwind('px-4 mt-3')}>
                <Text style={tailwind('font-semibold text-lg text-gray-50 w-full mb-1')}>{`${format(date, 'eeee')} orders`}</Text>
                <View>
                    <View style={tailwind('flex flex-row items-center mb-1')}>
                        <Text style={tailwind('text-base text-gray-100')}>{pluralize(getActiveOrdersCount(orders), 'order')}</Text>
                        <Text style={tailwind('text-base text-gray-100 mx-2')}>•</Text>
                        <Text style={tailwind('text-base text-gray-100')}>{`${getTotalStops(orders)} stops`}</Text>
                        <Text style={tailwind('text-base text-gray-100 mx-2')}>•</Text>
                        <Text style={tailwind('text-base text-gray-100')}>{formatDuration(getTotalDuration(orders))}</Text>
                        <Text style={tailwind('text-base text-gray-100 mx-2')}>•</Text>
                        <Text style={tailwind('text-base text-gray-100')}>{formatKm(getTotalDistance(orders) / 1000)}</Text>
                    </View>
                </View>
            </View>
            <ScrollView
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={getColorCode('text-blue-200')} />}
                stickyHeaderIndices={[1]}
                style={tailwind('w-full h-full')}
            >
                <View style={tailwind('w-full h-full')}>
                    {orders.map((order, index) => (
                        <OrderCard key={index} order={order} onPress={() => navigation.push('OrderScreen', { data: order.serialize() })} />
                    ))}
                </View>
            </ScrollView>
        </View>
    );
};

export default OrdersScreen;
