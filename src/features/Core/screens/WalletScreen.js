import { Order } from '@fleetbase/sdk';
import DefaultHeader from 'components/headers/DefaultHeader';
import { format } from 'date-fns';
import { useDriver, useFleetbase, useMountedState, useResourceCollection } from 'hooks';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { tailwind } from 'tailwind';
import { logError } from 'utils';

const WalletScreen = ({ navigation }) => {
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
    const [orders, setOrders] = useResourceCollection(`orders_${format(date, 'yyyyMMdd')}`, Order, fleetbase.getAdapter());

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
            <DefaultHeader />
        </View>
    );
};

export default WalletScreen;
