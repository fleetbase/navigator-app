import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, TextInput, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventRegister } from 'react-native-event-listeners';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faTimes, faCheck, faStoreAlt, faMapMarkerAlt, faCogs, faHandHoldingHeart, faSatelliteDish, faShippingFast, faCar, faMoneyBillWave } from '@fortawesome/free-solid-svg-icons';
import { adapter as FleetbaseAdapter } from 'hooks/use-fleetbase';
import { useMountedState, useLocale, useResourceStorage } from 'hooks';
import { formatCurrency, formatKm, formatDistance, calculatePercentage, translate, logError, isEmpty } from 'utils';
import { Order } from '@fleetbase/sdk';
import { format, formatDistance as formatDateDistance, add } from 'date-fns';
import FastImage from 'react-native-fast-image';
import DefaultHeader from 'ui/headers/DefaultHeader';
import OrderStatusBadge from 'ui/OrderStatusBadge';
import OrderWaypoints from 'ui/OrderWaypoints';
import OrderRouteMap from 'ui/OrderRouteMap';
import MapView, { Marker } from 'react-native-maps';
import tailwind from 'tailwind';

const { addEventListener, removeEventListener } = EventRegister;

const OrderScreen = ({ navigation, route }) => {
    const { data } = route.params;

    const insets = useSafeAreaInsets();
    const isMounted = useMountedState();
    const [locale] = useLocale();

    const [order, setOrder] = useState(new Order(data, FleetbaseAdapter));

    const orderStatusMap = {
        created: { icon: faCheck, color: 'green' },
        preparing: { icon: faCogs, color: 'yellow' },
        ready: { icon: faHandHoldingHeart, color: 'indigo' },
        dispatched: { icon: faSatelliteDish, color: 'indigo' },
        driver_assigned: { icon: faShippingFast, color: 'green' },
        driver_enroute: { icon: faShippingFast, color: 'yellow' },
        completed: { icon: faCheck, color: 'green' },
    };

    const { icon, color } = orderStatusMap[order.getAttribute('status')];

    const isOrderCompleted = order.getAttribute('status') === 'completed';
    const isOrderCanceled = order.getAttribute('status') === 'canceled';
    const isOrderDispatched = order.getAttribute('status') === 'dispatched';
    const isOrderStarted = order.getAttribute('started') === true;
    const isDispatched = order.dispatched === true || isOrderDispatched;
    const isEnroute = order.getAttribute('status') === 'driver_enroute';
    const isOrderInProgress = isOrderStarted && !isOrderCanceled && !isOrderCompleted;
    const isPickupOrder = order.getAttribute('meta.is_pickup');
    const currency = order.getAttribute('meta.currency');
    const subtotal = order.getAttribute('meta.subtotal');
    const total = order.getAttribute('meta.total');
    const tip = order.getAttribute('meta.tip');
    const deliveryTip = order.getAttribute('meta.delivery_tip');
    const isCod = order.getAttribute('payload.cod_amount') > 0;
    const isMultiDropOrder = !isEmpty(order.getAttribute('payload.waypoints'));
    const scheduledAt = order.isAttributeFilled('scheduled_at') ? format(new Date(order.getAttribute('scheduled_at')), 'PPpp') : null;
    const createdAt = format(new Date(order.getAttribute('created_at')), 'PPpp');
    const customer = order.getAttribute('customer');

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

    // deliver states -> created -> preparing -> dispatched -> driver_enroute -> completed
    // pickup states -> created -> preparing -> ready -> completed

    const track = () => {
        order
            .reload()
            .then((order) => {
                setOrder(order);
            })
            .catch(logError);
    };

    useEffect(() => {
        const watchNotifications = addEventListener('onNotification', (notification) => {
            order.reload().then(setOrder).catch(logError);
        });

        track();

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
                        <OrderStatusBadge status={order.getAttribute('status')} wrapperStyle={tailwind('flex-grow-0')} />
                    </View>
                    <View>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('')}>
                            <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                                <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
            <ScrollView showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
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
                                        <View style={tailwind('flex flex-row items-center')}>
                                            <View>
                                                <FastImage source={{ uri: customer.photo_url }} />
                                            </View>
                                            <View>
                                                <Text style={tailwind('font-semibold mb-1')}>{customer.name}</Text>
                                                <Text style={tailwind('mb-1')}>{customer.phone}</Text>
                                                <Text style={tailwind('')}>{customer.email}</Text>
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
                                            <Text style={tailwind('text-gray-100')}>Date Scheduled</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{order.getAttribute('scheduled_at') ?? 'None'}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Date Created</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{format(new Date(order.getAttribute('created_at')), 'PPpp')}</Text>
                                        </View>
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
                                                                        <TouchableOpacity>
                                                                            <View style={tailwind('flex items-center justify-center border border-gray-700 py-4 px-1')}>
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
                                                        <TouchableOpacity>
                                                            <View style={tailwind('flex items-center justify-center border border-gray-700 py-4 px-1')}>
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
                                                <Text style={tailwind('text-gray-200')}>{formatCurrency((entity.meta.subtotal ?? 0) / 100, entity.currency)}</Text>
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
                                        <Text style={tailwind('text-gray-100')}>{formatCurrency(order.getAttribute('meta.subtotal') / 100, order.getAttribute('meta.currency'))}</Text>
                                    </View>
                                    {!isPickupOrder && (
                                        <View style={tailwind('flex flex-row items-center justify-between mb-2')}>
                                            <Text style={tailwind('text-gray-100')}>{translate('Shared.OrderScreen.deliveryFee')}</Text>
                                            <Text style={tailwind('text-gray-100')}>
                                                {formatCurrency(order.getAttribute('meta.delivery_fee') / 100, order.getAttribute('meta.currency'))}
                                            </Text>
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
                                        <Text style={tailwind('font-semibold text-white')}>
                                            {formatCurrency(order.getAttribute('meta.total') / 100, order.getAttribute('meta.currency'))}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
};

export default OrderScreen;
