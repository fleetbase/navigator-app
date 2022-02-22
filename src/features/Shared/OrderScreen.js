import React, { useState, useEffect, createRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Alert, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventRegister } from 'react-native-event-listeners';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faTimes, faCheck, faMapMarkerAlt, faCogs, faHandHoldingHeart, faSatelliteDish, faShippingFast, faMoneyBillWave, faLocationArrow } from '@fortawesome/free-solid-svg-icons';
import { adapter as FleetbaseAdapter } from 'hooks/use-fleetbase';
import { useMountedState, useLocale, useResourceStorage } from 'hooks';
import { config, formatCurrency, formatKm, formatDistance, calculatePercentage, translate, logError, isEmpty, getColorCode, titleize, formatMetaValue } from 'utils';
import { Order } from '@fleetbase/sdk';
import { format, formatDistance as formatDateDistance, add, isValid as isValidDate } from 'date-fns';
import ActionSheet from 'react-native-actions-sheet';
import FastImage from 'react-native-fast-image';
import DefaultHeader from 'ui/headers/DefaultHeader';
import OrderStatusBadge from 'ui/OrderStatusBadge';
import OrderWaypoints from 'ui/OrderWaypoints';
import OrderRouteMap from 'ui/OrderRouteMap';
import MapView, { Marker } from 'react-native-maps';
import tailwind from 'tailwind';

const { addEventListener, removeEventListener } = EventRegister;
const { width, height } = Dimensions.get('window');

const isObjectEmpty = (obj) => isEmpty(obj) || Object.values(obj).length === 0;

console.log('MAPBOX_ACCESS_TOKEN', config('MAPBOX_ACCESS_TOKEN'));
console.log('MAPBOX_SECRET_TOKEN', config('MAPBOX_SECRET_TOKEN'));
console.log('GOOGLE_MAPS_KEY', config('GOOGLE_MAPS_KEY'));

const OrderScreen = ({ navigation, route }) => {
    const { data } = route.params;

    const insets = useSafeAreaInsets();
    const isMounted = useMountedState();
    const actionSheetRef = createRef();
    const [locale] = useLocale();

    const [order, setOrder] = useState(new Order(data, FleetbaseAdapter));
    const [isLoadingAction, setIsLoadingAction] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingActivity, setIsLoadingActivity] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [nextActivity, setNextActivity] = useState(null);

    const isPickupOrder = order.getAttribute('meta.is_pickup');
    const currency = order.getAttribute('meta.currency');
    const subtotal = order.getAttribute('meta.subtotal', 0);
    const total = order.getAttribute('meta.total', 0);
    const tip = order.getAttribute('meta.tip', 0);
    const deliveryTip = order.getAttribute('meta.delivery_tip', 0);
    const isCod = order.getAttribute('payload.cod_amount') > 0;
    const isMultiDropOrder = !isEmpty(order.getAttribute('payload.waypoints'));
    const scheduledAt = order.isAttributeFilled('scheduled_at') ? format(new Date(order.getAttribute('scheduled_at')), 'PPpp') : null;
    const createdAt = format(new Date(order.getAttribute('created_at')), 'PPpp');
    const customer = order.getAttribute('customer');
    const destination = [order.getAttribute('payload.pickup'), ...order.getAttribute('payload.waypoints', []), order.getAttribute('payload.dropoff')].find((place) => {
        return place.id === order.getAttribute('payload.current_waypoint');
    });
    const canNavigate = order.getAttribute('payload.current_waypoint') !== null && destination && order.isInProgress && config('MAPBOX_ACCESS_TOKEN') !== null;

    const formattedTip = (() => {
        if (typeof tip === 'string' && tip.endsWith('%')) {
            const tipAmount = formatCurrency(calculatePercentage(parseInt(tip), subtotal) / 100, currency);

            return `${tip} (${tipAmount})`;
        }

        return formatCurrency(tip / 100, currency);
    })();

    const formattedDeliveryTip = (() => {
        if (typeof deliveryTip === 'string' && deliveryTip.endsWith('%')) {
            const tipAmount = formatCurrency(calculatePercentage(parseInt(deliveryTip), subtotal) / 100, currency);

            return `${deliveryTip} (${tipAmount})`;
        }

        return formatCurrency(deliveryTip / 100, currency);
    })();

    const calculateEntitiesSubtotal = () => {
        const entities = order.getAttribute('payload.entities', []);
        let subtotal = 0;

        for (let index = 0; index < entities.length; index++) {
            const entity = entities[index];
            subtotal += parseInt(entity.price);
        }

        return subtotal;
    };

    const calculateDeliverySubtotal = () => {
        const purchaseRate = order.getAttribute('purchase_rate');
        let subtotal = 0;

        if (purchaseRate) {
            subtotal = purchaseRate.amount;
        } else if (order?.meta?.delivery_free) {
            subtotal = order.getAttribute('meta.delivery_fee');
        }

        return parseInt(subtotal);
    };

    const calculateTotal = () => {
        let subtotal = calculateEntitiesSubtotal();
        let deliveryFee = calculateDeliverySubtotal();
        let tips = parseInt(deliveryTip ? deliveryTip : 0) + parseInt(tip ? tip : 0);

        return subtotal + deliveryFee + tips;
    };

    // deliver states -> created -> preparing -> dispatched -> driver_enroute -> completed
    // pickup states -> created -> preparing -> ready -> completed

    const catchError = (error) => {
        if (!error) {
            return;
        }

        logError(error);
        Alert.alert('Error', error?.message ?? 'An error occured');
    };

    const reload = () => {
        order.reload().then(setOrder).catch(catchError);
    };

    const refresh = () => {
        setIsRefreshing(true);

        order
            .reload()
            .then(setOrder)
            .catch(catchError)
            .finally(() => {
                setIsRefreshing(false);
            });
    };

    const startOrder = (params = {}) => {
        setIsLoadingAction(true);

        order
            .start(params)
            .then(setOrder)
            .catch((error) => {
                if (error?.message?.startsWith('Order has not been dispatched')) {
                    return Alert.alert('Order Not Dispatched Yet', 'This order is not yet dispatched, are you sure you want to continue?', [
                        {
                            text: 'Yes',
                            onPress: () => {
                                return startOrder({ skipDispatch: true });
                            },
                        },
                        {
                            text: 'Cancel',
                            onPress: () => {
                                return reload();
                            },
                        },
                    ]);
                }
                logError(error);
            })
            .finally(() => {
                setIsLoadingAction(false);
            });
    };

    const updateOrderActivity = async () => {
        setIsLoadingAction(true);

        const activity = await order.getNextActivity().finally(() => {
            setIsLoadingAction(false);
        });

        console.log('activity', activity);

        if (activity.require_pod) {
            // do proof of delivery
        }

        if (activity.code === 'dispatched') {
            return Alert.alert('Warning!', 'This order is not yet dispatched, are you sure you want to continue?', [
                {
                    text: 'Yes',
                    onPress: () => {
                        return order.updateActivity({ skipDispatch: true }).then(setOrder).catch(catchError);
                    },
                },
                {
                    text: 'Cancel',
                    onPress: () => {
                        return reload();
                    },
                },
            ]);
        }

        setNextActivity(activity);
    };

    const sendOrderActivityUpdate = (activity) => {
        setIsLoadingActivity(true);

        return order
            .updateActivity({ activity })
            .then(setOrder)
            .catch(catchError)
            .finally(() => {
                setNextActivity(null);
                setIsLoadingActivity(false);
            });
    };

    const completeOrder = (activity) => {
        setIsLoadingActivity(true);

        return order
            .complete()
            .then(setOrder)
            .catch(catchError)
            .finally(() => {
                setNextActivity(null);
                setIsLoadingActivity(false);
            });
    };

    useEffect(() => {
        if (nextActivity !== null) {
            actionSheetRef.current?.setModalVisible(true);
        } else {
            actionSheetRef.current?.setModalVisible(false);
        }
    }, [nextActivity]);

    useEffect(() => {
        const watchNotifications = addEventListener('onNotification', (notification) => {
            reload();
        });

        reload();

        return () => {
            removeEventListener(watchNotifications);
        };
    }, [isMounted]);

    return (
        <View style={[tailwind('bg-gray-800 h-full')]}>
            <View style={[tailwind('z-50 bg-gray-800 border-b border-gray-900 shadow-lg'), { paddingTop: insets.top }]}>
                <View style={tailwind('flex flex-row items-start justify-between px-4 py-2 overflow-hidden')}>
                    <View style={tailwind('flex items-start')}>
                        <Text style={tailwind('text-xl font-semibold text-white')}>{order.id}</Text>
                        <Text style={tailwind('text-gray-50 mb-1')}>{scheduledAt ?? createdAt}</Text>
                        <View style={tailwind('flex flex-row')}>
                            <OrderStatusBadge status={order.getAttribute('status')} wrapperStyle={tailwind('flex-grow-0')} />
                            {order.getAttribute('status') === 'created' && order.isDispatched && <OrderStatusBadge status={'dispatched'} wrapperStyle={tailwind('ml-1')} />}
                        </View>
                    </View>
                    <View>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('')}>
                            <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                                <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={tailwind('flex flex-row items-center px-4 pb-2 mt-1')}>
                    <View style={tailwind('flex-1')}>
                        {order.isNotStarted && (
                            <TouchableOpacity style={tailwind('')} onPress={startOrder}>
                                <View style={tailwind('btn bg-green-900 border border-green-700')}>
                                    {isLoadingAction && <ActivityIndicator color={getColorCode('text-green-50')} style={tailwind('mr-2')} />}
                                    <Text style={tailwind('font-semibold text-green-50 text-base')}>Start Order</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                        {order.isInProgress && (
                            <TouchableOpacity style={tailwind('')} onPress={updateOrderActivity}>
                                <View style={tailwind('btn bg-green-900 border border-green-700')}>
                                    {isLoadingAction && <ActivityIndicator color={getColorCode('text-green-50')} style={tailwind('mr-2')} />}
                                    <Text style={tailwind('font-semibold text-green-50 text-base')}>Update Activity</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                        {canNavigate && (
                            <TouchableOpacity style={tailwind('mt-2')} onPress={() => navigation.push('NavigationScreen', { _order: order.serialize(), _destination: destination })}>
                                <View style={tailwind('btn bg-blue-900 border border-blue-700 py-0 px-4 w-full')}>
                                    <View style={tailwind('flex flex-row justify-start')}>
                                        <View style={tailwind('border-r border-blue-700 py-2 pr-4 flex flex-row items-center')}>
                                            <FontAwesomeIcon icon={faLocationArrow} style={tailwind('text-blue-50 mr-2')} />
                                            <Text style={tailwind('font-semibold text-blue-50 text-base')}>Navigate</Text>
                                        </View>
                                        <View style={tailwind('flex-1 py-2 px-2 flex items-center')}>
                                            <Text numberOfLines={1} style={tailwind('text-blue-50 text-base')}>{destination.address}</Text>
                                        </View>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
            <ScrollView
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={getColorCode('text-blue-200')} />}
            >
                <View style={tailwind('flex w-full h-full pb-60')}>
                    <View style={tailwind('flex flex-row items-center justify-center')}>
                        <View style={tailwind('w-full')}>
                            <OrderRouteMap order={order} />
                        </View>
                    </View>
                    <View style={tailwind('bg-gray-800 ')}>
                        <View style={tailwind('px-4 py-3')}>
                            <OrderWaypoints order={order} />
                        </View>
                        <View style={tailwind('mt-2')}>
                            <View style={tailwind('flex flex-col items-center')}>
                                <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700')}>
                                    <View style={tailwind('flex flex-row items-center')}>
                                        <Text style={tailwind('font-semibold text-gray-100')}>Customer</Text>
                                    </View>
                                </View>
                                <View style={tailwind('w-full p-4')}>
                                    {customer ? (
                                        <View style={tailwind('flex flex-row')}>
                                            <View>
                                                <FastImage source={{ uri: customer.photo_url }} style={tailwind('w-14 h-14 mr-4 rounded-md')} />
                                            </View>
                                            <View>
                                                <Text style={tailwind('font-semibold text-gray-50')}>{customer.name}</Text>
                                                <Text style={tailwind('text-gray-50')}>{customer.phone}</Text>
                                                <Text style={tailwind('text-gray-50')}>{customer.email}</Text>
                                            </View>
                                        </View>
                                    ) : (
                                        <Text style={tailwind('text-gray-100')}>No Customer</Text>
                                    )}
                                </View>
                            </View>
                        </View>
                        <View style={tailwind('mt-2')}>
                            <View style={tailwind('flex flex-col items-center')}>
                                <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700 mb-1')}>
                                    <View style={tailwind('flex flex-row items-center')}>
                                        <Text style={tailwind('font-semibold text-gray-100')}>Details</Text>
                                    </View>
                                </View>
                                <View style={tailwind('w-full py-2')}>
                                    <View style={tailwind('flex flex-row items-center justify-between pb-1 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Status</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <OrderStatusBadge status={order.getAttribute('status')} style={tailwind('px-3 py-0.5')} />
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Internal ID</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{order.getAttribute('internal_id')}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Order Type</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{order.getAttribute('type')}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Tracking Number</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{order.getAttribute('tracking_number.tracking_number')}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Date Created</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{order.createdAt ? format(order.createdAt, 'PPpp') : 'None'}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Date Scheduled</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{order.scheduledAt ? format(order.scheduledAt, 'PPpp') : 'None'}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Date Dispatched</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{order.dispatchedAt ? format(order.dispatchedAt, 'PPpp') : 'None'}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Date Started</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{order.startedAt ? format(order.startedAt, 'PPpp') : 'None'}</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                        {!isObjectEmpty(order.meta) && (
                            <View style={tailwind('mt-2')}>
                                <View style={tailwind('flex flex-col items-center')}>
                                    <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700 mb-1')}>
                                        <View style={tailwind('flex flex-row items-center')}>
                                            <Text style={tailwind('font-semibold text-gray-100')}>More Details</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('w-full py-2 -mt-1')}>
                                        {Object.keys(order.meta).map((key, index) => (
                                            <View key={index} style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                                <View style={tailwind('flex-1')}>
                                                    <Text style={tailwind('text-gray-100')}>{titleize(key)}</Text>
                                                </View>
                                                <View style={tailwind('flex-1 flex-col items-end')}>
                                                    <Text style={tailwind('text-gray-100')} numberOfLines={1}>
                                                        {formatMetaValue(order.meta[key])}
                                                    </Text>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            </View>
                        )}
                        <View style={tailwind('mt-2')}>
                            <View style={tailwind('flex flex-col items-center')}>
                                <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700')}>
                                    <View style={tailwind('flex flex-row items-center')}>
                                        <Text style={tailwind('font-semibold text-gray-100')}>QR Code/ Barcode</Text>
                                    </View>
                                </View>
                                <View style={tailwind('w-full p-4 flex flex-row items-center justify-center')}>
                                    <View style={tailwind('p-2 rounded-md bg-white mr-4')}>
                                        <FastImage style={tailwind('w-18 h-18')} source={{ uri: `data:image/png;base64,${order.getAttribute('tracking_number.qr_code')}` }} />
                                    </View>
                                    <View style={tailwind('p-2 rounded-md bg-white')}>
                                        <FastImage style={tailwind('w-40 h-18')} source={{ uri: `data:image/png;base64,${order.getAttribute('tracking_number.barcode')}` }} />
                                    </View>
                                </View>
                            </View>
                        </View>
                        <View style={tailwind('mt-2')}>
                            <View style={tailwind('flex flex-col items-center')}>
                                <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700')}>
                                    <View style={tailwind('flex flex-row items-center')}>
                                        <Text style={tailwind('font-semibold text-gray-100')}>Notes</Text>
                                    </View>
                                </View>
                                <View style={tailwind('w-full p-4')}>
                                    <Text style={tailwind('text-gray-100')}>{order.getAttribute('notes') || 'None'}</Text>
                                </View>
                            </View>
                        </View>
                        <View>
                            <View style={tailwind('flex flex-col items-center')}>
                                <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700')}>
                                    <View style={tailwind('flex flex-row items-center')}>
                                        <Text style={tailwind('font-semibold text-gray-100')}>Payload</Text>
                                    </View>
                                </View>
                                <View style={tailwind('p-4')}>
                                    {isMultiDropOrder ? (
                                        <View style={tailwind('flex flex-row flex-wrap')}>
                                            {entitiesByDestination.map((group, i) => (
                                                <View key={i} style={tailwind('w-full')}>
                                                    <View style={tailwind('rounded-md border border-gray-900 p-3 mb-3 w-full')}>
                                                        <View style={tailwind('mb-3')}>
                                                            <Text style={tailwind('text-gray-100 text-sm mb-1')}>Items drop at</Text>
                                                            <Text style={tailwind('text-gray-100 font-bold')}>{group.waypoint.address}</Text>
                                                        </View>
                                                        <View style={tailwind('w-full flex flex-row flex-wrap items-start')}>
                                                            {group.entities.map((entity, ii) => (
                                                                <View key={ii} style={tailwind('w-40')}>
                                                                    <View style={tailwind('p-1')}>
                                                                        <TouchableOpacity onPress={() => navigation.push('EntityScreen', { data: entity })}>
                                                                            <View style={tailwind('flex items-center justify-center py-4 px-1 border border-gray-700 rounded-md')}>
                                                                                <FastImage source={{ uri: entity.photo_url }} style={{ width: 50, height: 50, marginBottom: 5 }} />
                                                                                <Text numberOfLines={1} style={tailwind('text-gray-100 font-semibold')}>
                                                                                    {entity.name}
                                                                                </Text>
                                                                                <Text numberOfLines={1} style={tailwind('text-gray-100')}>
                                                                                    {entity.id}
                                                                                </Text>
                                                                                <Text numberOfLines={1} style={tailwind('text-gray-100')}>
                                                                                    {entity.tracking_number.tracking_number}
                                                                                </Text>
                                                                                <Text numberOfLines={1} style={tailwind('text-gray-100')}>
                                                                                    {formatCurrency((entity.price ?? 0) / 100, entity.currency)}
                                                                                </Text>
                                                                            </View>
                                                                        </TouchableOpacity>
                                                                    </View>
                                                                </View>
                                                            ))}
                                                        </View>
                                                    </View>
                                                </View>
                                            ))}
                                        </View>
                                    ) : (
                                        <View style={tailwind('flex flex-row flex-wrap items-start')}>
                                            {order.getAttribute('payload.entities', []).map((entity, i) => (
                                                <View key={i} style={tailwind('w-40')}>
                                                    <View style={tailwind('p-1')}>
                                                        <TouchableOpacity onPress={() => navigation.push('EntityScreen', { data: entity })}>
                                                            <View style={tailwind('flex items-center justify-center py-4 px-1 border border-gray-700 rounded-md')}>
                                                                <FastImage source={{ uri: entity.photo_url }} style={{ width: 50, height: 50, marginBottom: 5 }} />
                                                                <Text numberOfLines={1} style={tailwind('text-gray-100 font-semibold')}>
                                                                    {entity.name}
                                                                </Text>
                                                                <Text numberOfLines={1} style={tailwind('text-gray-100')}>
                                                                    {entity.id}
                                                                </Text>
                                                                <Text numberOfLines={1} style={tailwind('text-gray-100')}>
                                                                    {entity.tracking_number.tracking_number}
                                                                </Text>
                                                                <Text numberOfLines={1} style={tailwind('text-gray-100')}>
                                                                    {formatCurrency((entity.price ?? 0) / 100, entity.currency)}
                                                                </Text>
                                                            </View>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            </View>
                        </View>
                        <View style={tailwind('mt-2')}>
                            <View style={tailwind('flex flex-col items-center')}>
                                <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700')}>
                                    <View style={tailwind('flex flex-row items-center')}>
                                        <Text style={tailwind('font-semibold text-gray-100')}>{translate('Shared.OrderScreen.orderSummary')}</Text>
                                    </View>
                                    {isCod && (
                                        <View style={tailwind('flex flex-row items-center')}>
                                            <FontAwesomeIcon icon={faMoneyBillWave} style={tailwind('text-green-500 mr-1')} />
                                            <Text style={tailwind('text-green-500 font-semibold')}>{translate('Shared.OrderScreen.cash')}</Text>
                                        </View>
                                    )}
                                </View>
                                <View style={tailwind('w-full p-4 border-b border-gray-700')}>
                                    {order.getAttribute('payload.entities', []).map((entity, index) => (
                                        <View key={index} style={tailwind('flex flex-row mb-2')}>
                                            <View style={tailwind('mr-3')}>
                                                <View style={tailwind('rounded-md border border-gray-300 flex items-center justify-center w-7 h-7 mr-3')}>
                                                    <Text style={tailwind('font-semibold text-blue-500 text-sm')}>{entity.meta.quantity ?? 1}x</Text>
                                                </View>
                                            </View>
                                            <View style={tailwind('flex-1')}>
                                                <Text style={tailwind('font-semibold text-gray-50')}>{entity.name}</Text>
                                                <Text style={tailwind('text-xs text-gray-200')} numberOfLines={1}>
                                                    {entity.description ?? 'No description'}
                                                </Text>
                                                <View>
                                                    {entity.meta?.variants?.map((variant) => (
                                                        <View key={variant.id}>
                                                            <Text style={tailwind('text-xs text-gray-200')}>{variant.name}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                                <View>
                                                    {entity.meta?.addons?.map((addon) => (
                                                        <View key={addon.id}>
                                                            <Text style={tailwind('text-xs text-gray-200')}>+ {addon.name}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            </View>
                                            <View>
                                                <Text style={tailwind('text-gray-200')}>{formatCurrency((entity.price ?? 0) / 100, entity.currency)}</Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </View>
                        <View style={tailwind('mb-2')}>
                            <View style={tailwind('flex flex-col items-center')}>
                                <View style={tailwind('w-full p-4 border-b border-gray-700')}>
                                    <View style={tailwind('flex flex-row items-center justify-between mb-2')}>
                                        <Text style={tailwind('text-gray-100')}>{translate('Shared.OrderScreen.subtotal')}</Text>
                                        <Text style={tailwind('text-gray-100')}>{formatCurrency(calculateEntitiesSubtotal() / 100, order.getAttribute('meta.currency'))}</Text>
                                    </View>
                                    {!isPickupOrder && (
                                        <View style={tailwind('flex flex-row items-center justify-between mb-2')}>
                                            <Text style={tailwind('text-gray-100')}>{translate('Shared.OrderScreen.deliveryFee')}</Text>
                                            <Text style={tailwind('text-gray-100')}>{formatCurrency(calculateDeliverySubtotal() / 100, order.getAttribute('meta.currency'))}</Text>
                                        </View>
                                    )}
                                    {tip && (
                                        <View style={tailwind('flex flex-row items-center justify-between mb-2')}>
                                            <Text style={tailwind('text-gray-100')}>{translate('Shared.OrderScreen.tip')}</Text>
                                            <Text style={tailwind('text-gray-100')}>{formattedTip}</Text>
                                        </View>
                                    )}
                                    {deliveryTip && !isPickupOrder && (
                                        <View style={tailwind('flex flex-row items-center justify-between mb-2')}>
                                            <Text style={tailwind('text-gray-100')}>{translate('Shared.OrderScreen.deliveryTip')}</Text>
                                            <Text style={tailwind('text-gray-100')}>{formattedDeliveryTip}</Text>
                                        </View>
                                    )}
                                </View>
                                <View style={tailwind('w-full p-4')}>
                                    <View style={tailwind('flex flex-row items-center justify-between')}>
                                        <Text style={tailwind('font-semibold text-white')}>{translate('Shared.OrderScreen.total')}</Text>
                                        <Text style={tailwind('font-semibold text-white')}>{formatCurrency(calculateTotal() / 100, order.getAttribute('meta.currency'))}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>
            </ScrollView>
            <ActionSheet
                ref={actionSheetRef}
                containerStyle={{ height: height / 2, backgroundColor: getColorCode('bg-gray-800') }}
                parentContainer={[tailwind('bg-gray-800')]}
                indicatorColor={getColorCode('bg-gray-900')}
                overlayColor={getColorCode('bg-gray-900')}
                gestureEnabled={true}
                bounceOnOpen={true}
                closeOnTouchBackdrop={false}
                nestedScrollEnabled={true}
                statusBarTranslucent={true}
                defaultOverlayOpacity={0.7}
                onMomentumScrollEnd={() => actionSheetRef.current?.handleChildScrollEnd()}
            >
                <View style={{ minHeight: 800 }}>
                    <View style={tailwind('px-5 py-2 flex flex-row items-center justify-between mb-4')}>
                        <View style={tailwind('flex flex-row items-center')}>
                            <Text style={tailwind('text-lg font-semibold text-white')}>Confirm order activity</Text>
                        </View>

                        <View>
                            <TouchableOpacity onPress={() => actionSheetRef.current?.hide()}>
                                <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                                    <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View>
                        {!isObjectEmpty(nextActivity) ? (
                            <View style={tailwind('px-5')}>
                                <View>
                                    <TouchableOpacity style={tailwind('btn bg-green-900 border border-green-700 px-4')} onPress={() => sendOrderActivityUpdate(nextActivity)}>
                                        {isLoadingActivity && <ActivityIndicator color={getColorCode('text-green-50')} style={tailwind('ml-8 mr-3')} />}
                                        <View style={tailwind('w-full flex flex-col items-start py-2')}>
                                            <Text style={tailwind('font-bold text-lg text-green-50')}>{nextActivity.status}</Text>
                                            <Text style={tailwind('text-green-100')}>{nextActivity.details}</Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <View style={tailwind('px-5')}>
                                <View>
                                    <TouchableOpacity style={tailwind('btn bg-green-900 border border-green-700 px-4')} onPress={completeOrder}>
                                        {isLoadingActivity && <ActivityIndicator color={getColorCode('text-green-50')} style={tailwind('ml-8 mr-3')} />}
                                        <View style={tailwind('w-full flex flex-col items-start py-2')}>
                                            <Text style={tailwind('font-bold text-lg text-green-50')}>Complete Order</Text>
                                            <Text style={tailwind('text-green-100')}>Complete order and continue</Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>
                </View>
            </ActionSheet>
        </View>
    );
};

export default OrderScreen;
