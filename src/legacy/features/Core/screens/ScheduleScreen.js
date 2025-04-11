import OrderCard from 'components/OrderCard';
import DefaultHeader from 'components/headers/DefaultHeader';
import { format } from 'date-fns';
import { useDriver, useFleetbase, useMountedState } from 'hooks';
import React, { useEffect, useState } from 'react';
import { Dimensions, RefreshControl, Text, View } from 'react-native';
import { Agenda } from 'react-native-calendars';
import { tailwind } from 'tailwind';
import { getColorCode, logError } from 'utils';

const { width, height } = Dimensions.get('window');
const DATE_FORMAT = 'yyyy-MM-dd';

const ScheduleScreen = ({ navigation }) => {
    const isMounted = useMountedState();
    const fleetbase = useFleetbase();
    const [driver] = useDriver();

    const [date, setDateValue] = useState(new Date());
    const [params, setParams] = useState({
        driver: driver.id,
        on: format(date, DATE_FORMAT),
    });
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isQuerying, setIsQuerying] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [items, setItems] = useState({});

    const setOrders = (orders = []) => {
        items[format(date, DATE_FORMAT)] = orders;
        setItems(items);
    };

    const setParam = (key, value) => {
        if (key === 'on') {
            value = format(value, DATE_FORMAT);
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

        params['on'] = format(date, DATE_FORMAT);

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
        <View style={[tailwind('bg-gray-800 h-full')]}>
            <DefaultHeader
                onSearchResultPress={(order, closeDialog) => {
                    closeDialog();
                    navigation.push('OrderScreen', { data: order.serialize() });
                }}
            />
            <Agenda
                items={items}
                selected={format(date, DATE_FORMAT)}
                onDayPress={(day) => setDateValue(new Date(day.dateString))}
                renderItem={(item) => <OrderCard order={item} onPress={() => navigation.push('OrderScreen', { data: item?.serialize() })} />}
                renderEmptyDate={() => (
                    <View style={[tailwind('w-full flex py-12'), { height: height - 330 }]}>
                        <Text style={tailwind('text-gray-400 pl-8')}>No orders scheduled for this day</Text>
                    </View>
                )}
                onRefresh={onRefresh}
                refreshing={isRefreshing}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={getColorCode('text-blue-200')} />}
                showClosingKnob={true}
                style={tailwind('h-full')}
                theme={{
                    backgroundColor: getColorCode('bg-gray-800'),
                    calendarBackground: getColorCode('bg-gray-800'),
                    agendaKnobColor: getColorCode('text-gray-900'),
                    textSectionTitleColor: getColorCode('text-blue-400'),
                    textSectionTitleDisabledColor: getColorCode('text-gray-400'),
                    selectedDayBackgroundColor: getColorCode('text-blue-400'),
                    selectedDayTextColor: getColorCode('text-white'),
                    todayTextColor: getColorCode('text-blue-200'),
                    dayTextColor: getColorCode('text-blue-200'),
                    textDisabledColor: getColorCode('text-gray-700'),
                    arrowColor: getColorCode('text-blue-400'),
                    monthTextColor: getColorCode('text-blue-500'),
                    agendaDayTextColor: getColorCode('text-blue-400'),
                    agendaTodayColor: getColorCode('text-blue-500'),
                    agendaKnobColor: getColorCode('text-gray-900'),
                }}
            />
        </View>
    );
};

export default ScheduleScreen;
