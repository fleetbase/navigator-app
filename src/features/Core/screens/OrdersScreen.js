import { Order } from '@fleetbase/sdk';
import { faSatelliteDish } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useFocusEffect } from '@react-navigation/native';
import OrderCard from 'components/OrderCard';
import SimpleOrdersMetrics from 'components/SimpleOrdersMetrics';
import { endOfYear, format, startOfYear } from 'date-fns';
import { useDriver, useFleetbase, useMountedState, useResourceCollection } from 'hooks';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import CalendarStrip from 'react-native-calendar-strip';
import { EventRegister } from 'react-native-event-listeners';
import { tailwind } from 'tailwind';
import { formatMetersToKilometers, getColorCode, isArray, listenForOrdersFromSocket, logError } from 'utils';

const { addEventListener, removeEventListener } = EventRegister;
const REFRESH_NEARBY_ORDERS_MS = 6000 * 5; // 5 mins
const REFRESH_ORDERS_MS = 6000 * 10; // 10 mins

const OrdersScreen = ({ navigation }) => {
    const isMounted = useMountedState();
    const fleetbase = useFleetbase();
    const calendar = useRef();
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
    const [currentOrganization, setCurrentOrganization] = useState();

    const [searchingForNearbyOrders, setSearchingForNearbyOrders] = useState(false);
    const startingDate = new Date().setDate(date.getDate() - 2);
    const datesWhitelist = [
        new Date(),
        {
            start: startOfYear(new Date()),
            end: endOfYear(new Date()),
        },
    ];

    const setParam = useCallback((key, value) => {
        let updatedValue = value;
        if (key === 'on') {
            setDateValue(value);
            updatedValue = format(value, 'dd-MM-yyyy');
        }
        setParams(prevParams => ({ ...prevParams, [key]: updatedValue }));
    }, []);

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
            .catch(logError)
            .finally(() => {
                setIsRefreshing(false);
                setIsQuerying(false);
                setIsLoaded(true);
            });
    });

    useEffect(() => {
        driver.currentOrganization().then(setCurrentOrganization);
    }, []);
    const loadNearbyOrders = useCallback((options = {}) => {
        if (options.isRefreshing) {
            setIsRefreshing(true);
        }

        if (options.isQuerying) {
            setIsQuerying(true);
        }

        setSearchingForNearbyOrders(true);

        return fleetbase.orders
            .query({ nearby: driver?.id, adhoc: 1, unassigned: 1, dispatched: 1 })
            .then(setNearbyOrders)
            .catch(logError)
            .finally(() => {
                setSearchingForNearbyOrders(false);
            });
    });

    const insertNewOrder = useCallback(
        newOrder => {
            const orderExists = orders.isAny(order => order.id === newOrder.id);

            if (orderExists) {
                return;
            }

            setOrders(orders.pushObject(newOrder));
        },
        [orders, setOrders]
    );

    const onOrderPress = useCallback(order => {
        navigation.push('OrderScreen', { data: order.serialize() });
    });

    useFocusEffect(
        useCallback(() => {
            loadNearbyOrders();

            const interval = setInterval(loadNearbyOrders, REFRESH_NEARBY_ORDERS_MS);
            return () => clearInterval(interval);
        }, [])
    );

    useFocusEffect(
        useCallback(() => {
            loadOrders({ isQuerying: isLoaded });

            const interval = setInterval(loadOrders, REFRESH_ORDERS_MS);
            return () => clearInterval(interval);
        }, [date])
    );

    useEffect(() => {
        const notifications = addEventListener('onNotification', () => loadOrders({ isQuerying: true }));

        return () => {
            removeEventListener(notifications);
        };
    }, [isMounted]);

    useEffect(() => {
        const orders = addEventListener('order.synced', () => loadOrders({ isQuerying: true }));

        return () => {
            removeEventListener(orders);
        };
    }, [isMounted]);

    // Listen for new orders via Socket Connection
    useEffect(() => {
        listenForOrdersFromSocket(`driver.${driver?.id}`, (order, event) => {
            console.log('[socket event]', event);
            if (typeof event === 'string' && event === 'order.ready') {
                // Convert data to Fleetbase Order Resource
                const orderResource = new Order(order, fleetbase.getAdapter());

                // Insert new order resource
                if (orderResource) {
                    // Insert order
                    insertNewOrder(orderResource);
                }
            }
        });
    }, []);

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
            <View style={tailwind('px-4 border-b border-gray-900')}>
                <View style={tailwind('bg-gray-900 rounded-xl shadow-sm border border-gray-800 mb-1 px-1')}>
                    <CalendarStrip
                        scrollable
                        ref={calendar}
                        datesWhitelist={datesWhitelist}
                        style={{ height: 100, paddingTop: 10, paddingBottom: 15 }}
                        calendarColor={'transparent'}
                        calendarHeaderStyle={tailwind('text-gray-300 text-xs')}
                        calendarHeaderContainerStyle={tailwind('mb-2.5')}
                        dateNumberStyle={tailwind('text-sm text-gray-500')}
                        dateNameStyle={tailwind('text-sm text-gray-500')}
                        dayContainerStyle={tailwind('p-0 h-12')}
                        highlightDateNameStyle={tailwind('text-sm text-gray-100')}
                        highlightDateNumberStyle={tailwind('text-sm text-gray-100')}
                        highlightDateContainerStyle={tailwind('bg-blue-500 rounded-lg shadow-sm')}
                        iconContainer={{ flex: 0.1 }}
                        numDaysInWeek={5}
                        startingDate={startingDate}
                        selectedDate={date}
                        onDateSelected={selectedDate => setParam('on', new Date(selectedDate))}
                        iconLeft={require('assets/nv-arrow-left.png')}
                        iconRight={require('assets/nv-arrow-right.png')}
                    />
                </View>
                <SimpleOrdersMetrics orders={orders} date={date} wrapperStyle={tailwind('py-2')} containerClass={tailwind('px-0')} />
            </View>
            <ScrollView
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => loadOrders({ isRefreshing: true })} tintColor={getColorCode('text-blue-200')} />}
                stickyHeaderIndices={[1]}
                style={tailwind('w-full h-full')}>
                {isQuerying && (
                    <View style={tailwind('flex items-center justify-center p-5')}>
                        <ActivityIndicator />
                    </View>
                )}
                {isArray(nearbyOrders) && nearbyOrders.length > 0 && (
                    <View style={tailwind('px-2 mt-2')}>
                        <View style={tailwind('px-2 py-3 bg-yellow-50 rounded-lg')}>
                            <View>
                                <View style={tailwind('mb-2.5 px-2 flex-row items-center')}>
                                    <FontAwesomeIcon icon={faSatelliteDish} color={getColorCode('text-yellow-900')} style={tailwind('mr-2')} />
                                    <Text style={tailwind('text-yellow-900 font-bold text-lg')}>Nearby orders found</Text>
                                </View>
                                {nearbyOrders
                                    .sort((a, b) => b.createdAt - a.createdAt)
                                    .map((order, index) => (
                                        <View
                                            key={index}
                                            style={[
                                                tailwind('border border-yellow-300 bg-yellow-100 rounded-xl'),
                                                {
                                                    shadowOffset: { width: 0, height: 0 },
                                                    shadowOpacity: 0.3,
                                                    shadowRadius: 5,
                                                    shadowColor: 'rgba(252, 211, 77, 1)',
                                                    marginBottom: nearbyOrders.length > 1 ? 12 : 8,
                                                },
                                            ]}>
                                            <OrderCard
                                                headerTop={
                                                    <View style={tailwind('pt-3 pb-2 px-3')}>
                                                        <Text style={tailwind('text-yellow-900 font-semibold')}>
                                                            Nearby order {formatMetersToKilometers(order.getAttribute('distance'))} away
                                                        </Text>
                                                    </View>
                                                }
                                                order={order}
                                                wrapperStyle={tailwind('p-0 rounded-xl')}
                                                containerStyle={tailwind('border-0 bg-yellow-100')}
                                                headerStyle={tailwind('border-yellow-300 py-0 pb-3')}
                                                textStyle={tailwind('text-yellow-900')}
                                                orderIdStyle={tailwind('text-yellow-900')}
                                                onPress={() => onOrderPress(order)}
                                                badgeProps={{
                                                    containerStyle: order.status === 'created' ? tailwind('bg-yellow-200') : {},
                                                }}
                                            />
                                        </View>
                                    ))}
                            </View>
                        </View>
                    </View>
                )}
                <View style={tailwind('w-full h-full mt-2')}>
                    {isArray(orders) && orders.sort((a, b) => b.createdAt - a.createdAt).map((order, index) => <OrderCard key={index} order={order} onPress={() => onOrderPress(order)} />)}
                </View>
                <View style={tailwind('h-96 w-full')} />
            </ScrollView>
        </View>
    );
};

export default OrdersScreen;
