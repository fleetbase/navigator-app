import { Order } from '@fleetbase/sdk';
import { faBell, faFile, faLightbulb, faMapMarkerAlt, faMoneyBillWave, faRoute, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useNetInfo } from '@react-native-community/netinfo';
import OrderStatusBadge from 'components/OrderStatusBadge';
import OrderWaypoints from 'components/OrderWaypoints';
import { format } from 'date-fns';
import { useDriver, useFleetbase, useLocale, useMountedState } from 'hooks';
import React, { createRef, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Linking, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ActionSheet from 'react-native-actions-sheet';
import { EventRegister } from 'react-native-event-listeners';
import FastImage from 'react-native-fast-image';
import FileViewer from 'react-native-file-viewer';
import RNFS from 'react-native-fs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tailwind from 'tailwind';
import { calculatePercentage, formatCurrency, formatMetaValue, getColorCode, getStatusColors, isArray, isEmpty, logError, titleize, translate } from 'utils';
import { getString, setString, remove } from 'utils/Storage';
import OrderMapPicker from '../../components/OrderMapPicker';

const { addEventListener, removeEventListener } = EventRegister;
const { width, height } = Dimensions.get('window');

const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.0922;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

const isObjectEmpty = obj => isEmpty(obj) || Object.values(obj).length === 0;

const getOrderCurrency = order => {
    let currency = order.getAttribute('meta.currency');
    // check order for currency attribute too
    if (!currency) {
        currency = order.getAttribute('currency');
    }

    if (!currency) {
        const entities = order.getAttribute('payload.entities', []);

        if (isArray(entities) && entities.length) {
            currency = entities[0].currency;
        }
    }
    return currency ?? 'USD';
};

const OrderScreen = ({ navigation, route }) => {
    const { data } = route.params;
    const { isConnected } = useNetInfo();
    const insets = useSafeAreaInsets();
    const isMounted = useMountedState();
    const actionSheetRef = createRef();
    const fleetbase = useFleetbase();
    const [driver, setDriver] = useDriver();
    const [locale] = useLocale();

    const [order, setOrder] = useState(new Order(data, fleetbase.getAdapter()));
    const [isLoadingAction, setIsLoadingAction] = useState(false);
    const [isLoadingActivity, setIsLoadingActivity] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [nextActivity, setNextActivity] = useState(null);
    const [actionSheetAction, setActionSheetAction] = useState('update_activity');
    const [map, setMap] = useState(null);

    const isPickupOrder = order.getAttribute('meta.is_pickup');
    const currency = getOrderCurrency(order);
    const subtotal = order.getAttribute('meta.subtotal', 0);
    const total = order.getAttribute('meta.total', 0);
    const tip = order.getAttribute('meta.tip', 0);
    const deliveryTip = order.getAttribute('meta.delivery_tip', 0);
    const isCod = order.getAttribute('payload.cod_amount') > 0;
    const isMultiDropOrder = !isEmpty(order.getAttribute('payload.waypoints', []));
    const scheduledAt = order.isAttributeFilled('scheduled_at') ? format(new Date(order.getAttribute('scheduled_at')), 'PPpp') : null;
    const createdAt = format(new Date(order.getAttribute('created_at')), 'PPpp');
    const customer = order.getAttribute('customer');
    const destination = [order.getAttribute('payload.pickup'), ...order.getAttribute('payload.waypoints', []), order.getAttribute('payload.dropoff')].find(place => {
        return place?.id === order.getAttribute('payload.current_waypoint');
    });
    const canNavigate = order.isDispatched || order.isInProgress;
    const canSetDestination = isMultiDropOrder && order.isInProgress && !destination;
    const isAdhoc = order.getAttribute('adhoc') === true;
    const isDriverAssigned = order.getAttribute('driver_assigned') !== null;
    const isOrderPing = isDriverAssigned === false && isAdhoc === true && !['completed', 'canceled'].includes(order.getAttribute('status'));
    const documents = order.getAttribute('files', []);
    const entitiesByDestination = (() => {
        const groups = [];

        // if no waypoints return empty array
        if (isEmpty(order.getAttribute('payload.waypoints', []))) {
            return groups;
        }

        // create groups
        order.getAttribute('payload.waypoints', []).forEach(waypoint => {
            const destination = waypoint?.id;

            if (destination) {
                const entities = order.getAttribute('payload.entities', []).filter(entity => entity.destination === destination);

                if (entities.length === 0) {
                    return;
                }

                const group = {
                    destination,
                    waypoint,
                    entities,
                };

                groups.push(group);
            }
        });

        return groups;
    })();

    const waypointsInProgress = (() => {
        const waypointsInProgress = [];
        const waypoints = order.getAttribute('payload.waypoints', []);
        const statusesToSkip = ['completed', 'canceled'];

        for (let index = 0; index < waypoints.length; index++) {
            const waypoint = waypoints[index];

            if (!waypoint?.tracking || statusesToSkip.includes(waypoint.tracking?.toLowerCase())) {
                continue;
            }

            waypointsInProgress.push(waypoint);
        }

        return waypointsInProgress;
    })();

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

            subtotal += parseInt(entity?.price ?? 0);
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

    const catchError = error => {
        if (!error) {
            return;
        }

        logError(error);
        Alert.alert('Error', error?.message ?? 'An error occured');
    };

    const loadOrder = (options = {}) => {
        if (options.isRefreshing) {
            setIsRefreshing(true);
        }

        return fleetbase.orders
            .findRecord(order.id)
            .then(setOrder)
            .catch(catchError)
            .finally(() => {
                setIsRefreshing(false);
            });
    };

    const addToRequestQueue = ({ method, params, resource, resourceType, endpoint }) => {
        let apiRequestQueue = JSON.parse(getString('apiRequestQueue'));
        if (isArray(apiRequestQueue)) {
            apiRequestQueue.push({ method, params, resource, resourceType, endpoint });
        } else {
            apiRequestQueue = [{ method, params, resource, resourceType, endpoint }];
        }

        setString('apiRequestQueue', JSON.stringify(apiRequestQueue));
    };

    const setOrderDestination = waypoint => {
        if (!waypoint) {
            return;
        }

        setIsLoadingAction(true);

        order
            .setDestination(waypoint.id)
            .then(setOrder)
            .catch(catchError)
            .finally(() => {
                setActionSheetAction('update_activity');
                setIsLoadingAction(false);
            });
    };

    const startOrder = (params = {}) => {
        setIsLoadingAction(true);

        if (!isConnected) {
            addToRequestQueue({ method: 'start', params: { skipDispatch: true }, resource: order.serialize(), resourceType: 'Order' });
            setIsLoadingAction(false);
            return;
        }

        order
            .start(params)
            .then(setOrder)
            .catch(error => {
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
                                return loadOrder();
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

    const declineOrder = (params = {}) => {
        return navigation.goBack();
    };

    const updateOrderActivity = async () => {
        // setIsLoadingAction(true);
        setActionSheetAction('update_activity');

        if (!isConnected) {
            addToRequestQueue({ method: 'updateActivity', params: { skipDispatch: true }, resource: order.serialize(), resourceType: 'Order' });
            setIsLoadingAction(false);
            return;
        }

        const activity = await order.getNextActivity({ waypoint: destination?.id }).finally(() => {
            setIsLoadingAction(false);
        });

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
                        return loadOrder();
                    },
                },
            ]);
        }

        setNextActivity(activity);
    };

    const toggleChangeDestinationWaypoint = () => {
        if (actionSheetAction === 'change_destination') {
            actionSheetRef.current?.setModalVisible(true);
        } else {
            setActionSheetAction('change_destination');
        }
    };

    const sendOrderActivityUpdate = activity => {
        setIsLoadingActivity(true);

        if (activity.require_pod) {
            actionSheetRef.current?.setModalVisible(false);
            return navigation.push('ProofScreen', { activity, _order: order.serialize(), _waypoint: destination });
        }

        return order
            .updateActivity({ activity })
            .then(setOrder)
            .catch(catchError)
            .finally(() => {
                setNextActivity(null);
                setIsLoadingActivity(false);
            });
    };

    const completeOrder = activity => {
        setIsLoadingActivity(true);

        return order
            .complete()
            .then(setOrder)
            .catch(catchError)
            .finally(() => {
                setTimeout(() => {
                    setNextActivity(null);
                    setIsLoadingActivity(false);
                }, 2000);
            });
    };

    const focusPlaceOnMap = place => {
        if (!map) {
            return;
        }

        const destination = {
            latitude: place.location.coordinates[1] - 0.0005,
            longitude: place.location.coordinates[0],
        };

        const latitudeZoom = 8;
        const longitudeZoom = 8;
        const latitudeDelta = LATITUDE_DELTA / latitudeZoom;
        const longitudeDelta = LONGITUDE_DELTA / longitudeZoom;

        map.current?.animateToRegion({
            ...destination,
            latitudeDelta,
            longitudeDelta,
        });
    };

    const handleMetafieldPress = useCallback(metaValue => {
        if (typeof metaValue === 'string' && metaValue.startsWith('http')) {
            Linking.openURL(metaValue);
        }
    });

    useEffect(() => {
        setTimeout(() => {
            loadOrder();
        }, 600);
    }, [nextActivity]);

    useEffect(() => {
        if (actionSheetAction === 'change_destination') {
            actionSheetRef.current?.setModalVisible(true);
        } else {
            actionSheetRef.current?.setModalVisible(false);
        }
    }, [actionSheetAction]);

    useEffect(() => {
        if (nextActivity !== null) {
            actionSheetRef.current?.setModalVisible(true);
        } else {
            actionSheetRef.current?.setModalVisible(false);
        }
    }, [nextActivity]);

    useEffect(() => {
        const watchNotifications = addEventListener('onNotification', notification => {
            loadOrder();
        });

        loadOrder();

        return () => {
            removeEventListener(watchNotifications);
        };
    }, [isMounted]);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            loadOrder().then(() => {
                setIsLoadingActivity(false);
            });
        });

        return unsubscribe;
    }, [isMounted]);

    let actionSheetHeight = height / 2;

    if (actionSheetAction === 'change_destination') {
        actionSheetHeight = height - 150;
    }

    if (destination) {
        focusPlaceOnMap(destination);
    }

    const openMedia = async url => {
        // Extract filename from URL
        const fileNameParts = url?.split('/')?.pop()?.split('?');
        const fileName = fileNameParts.length > 0 ? fileNameParts[0] : '';

        // Create local file path
        const localFile = `${RNFS.DocumentDirectoryPath}/${fileName}`;

        // Set up download options
        const options = {
            fromUrl: url,
            toFile: localFile,
        };

        RNFS.downloadFile(options).promise.then(() => {
            RNFS.readDir(RNFS.DocumentDirectoryPath);
            FileViewer.open(localFile);
        });
    };

    const checkIsImage = documentType => {
        return documentType.content_type.startsWith('image/');
    };

    const renderDocumentItem = (document, index) => {
        return (
            <View style={tailwind('flex rounded-md bg-white mt-2 mr-3 ')} key={index.toString()}>
                <TouchableOpacity
                    onPress={() => {
                        openMedia(document.url);
                    }}>
                    {checkIsImage(document) ? (
                        <FastImage style={tailwind('w-18 h-18 m-1 ')} source={{ uri: document.url }} resizeMode={FastImage.resizeMode.contain} />
                    ) : (
                        <View style={tailwind('items-center justify-between p-1 ')}>
                            <FontAwesomeIcon size={70} icon={faFile} style={tailwind('text-gray-400')} />
                        </View>
                    )}
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <View style={[tailwind('bg-gray-800 h-full')]}>
            <View style={[tailwind('z-50 bg-gray-800 border-b border-gray-900 shadow-lg pt-2')]}>
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
                        {isOrderPing && (
                            <View>
                                <View style={tailwind('mb-2 flex flex-row items-center')}>
                                    <FontAwesomeIcon icon={faBell} style={tailwind('text-yellow-400 mr-1')} />
                                    <Text style={tailwind('text-lg text-white font-semibold')}>Incoming Order!</Text>
                                </View>
                                <View style={tailwind('flex flex-row items-center justify-between')}>
                                    <View style={tailwind('pr-1 flex-1')}>
                                        <TouchableOpacity style={tailwind('')} onPress={() => startOrder({ assign: driver.id })}>
                                            <View style={tailwind('btn bg-green-900 border border-green-700')}>
                                                {isLoadingAction && <ActivityIndicator color={getColorCode('text-green-50')} style={tailwind('mr-2')} />}
                                                <Text style={tailwind('font-semibold text-green-50 text-base')}>Accept Order</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={tailwind('pl-1 flex-1')}>
                                        <TouchableOpacity style={tailwind('')} onPress={() => declineOrder()}>
                                            <View style={tailwind('btn bg-red-900 border border-red-700')}>
                                                <Text style={tailwind('font-semibold text-red-50 text-base')}>Decline Order</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        )}
                        {order.isNotStarted && !order.isCanceled && !isOrderPing && order.getAttribute('status') !== 'completed' && (
                            <TouchableOpacity style={tailwind('')} onPress={() => startOrder()}>
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
                    </View>
                </View>
            </View>
            <ScrollView
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => loadOrder({ isRefreshing: true })} tintColor={getColorCode('text-blue-200')} />}>
                <View style={tailwind('flex w-full h-full pb-60')}>
                    {canNavigate && (
                        <View style={tailwind('flex flex-row items-center justify-center flex-1')}>
                            <OrderMapPicker order={order} />
                        </View>
                    )}
                    <View style={tailwind('bg-gray-800 ')}>
                        <View style={tailwind('px-4 pb-3 pt-4')}>
                            {destination && order.isInProgress && (
                                <View style={tailwind('mb-4')}>
                                    <View style={tailwind('flex rounded-md bg-blue-900 border border-blue-700')}>
                                        <View style={tailwind('px-4 py-2 flex-1 border-b border-blue-700')}>
                                            <Text style={tailwind('font-bold text-white mb-1')}>Current Destination</Text>
                                            <Text style={tailwind('text-blue-50')}>{destination.address}</Text>
                                            {destination?.tracking && (
                                                <View style={tailwind('my-2 flex flex-row')}>
                                                    <OrderStatusBadge status={destination?.tracking ?? 'pending'} wrapperStyle={tailwind('flex-grow-0')} />
                                                </View>
                                            )}
                                        </View>
                                        {waypointsInProgress.length > 0 && (
                                            <View style={tailwind('flex flex-row')}>
                                                <TouchableOpacity
                                                    onPress={toggleChangeDestinationWaypoint}
                                                    style={tailwind('flex-1 px-2 py-2 border-r border-blue-700 flex items-center justify-center')}>
                                                    <FontAwesomeIcon icon={faRoute} style={tailwind('text-blue-50 mb-1')} />
                                                    <Text style={tailwind('text-blue-50')}>Change</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            )}
                            {canSetDestination && (
                                <View style={tailwind('mb-4')}>
                                    <View style={tailwind('flex rounded-md bg-blue-900 border border-blue-700')}>
                                        <View style={tailwind('flex flex-row')}>
                                            <TouchableOpacity onPress={toggleChangeDestinationWaypoint} style={tailwind('flex flex-row px-4 py-3 flex items-center justify-center')}>
                                                <FontAwesomeIcon icon={faMapMarkerAlt} style={tailwind('text-blue-50 mr-2')} />
                                                <Text style={tailwind('text-blue-50 font-semibold')}>Set Destination</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            )}
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
                                            <Text style={tailwind('font-semibold text-gray-100')}>Metadata/ More Details</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('w-full py-2 -mt-1')}>
                                        {isArray(Object.keys(order.meta)) &&
                                            Object.keys(order.meta).map((key, index) => (
                                                <View key={index} style={tailwind('flex flex-row items-start justify-between py-2 px-3')}>
                                                    <View style={tailwind('w-20')}>
                                                        <Text style={tailwind('text-gray-100')}>{titleize(key)}</Text>
                                                    </View>
                                                    <TouchableOpacity onPress={() => handleMetafieldPress(order.meta[key])} style={tailwind('flex-1 flex-col items-end')}>
                                                        <Text style={tailwind('text-gray-100')} numberOfLines={1}>
                                                            {formatMetaValue(order.meta[key])}
                                                        </Text>
                                                    </TouchableOpacity>
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
                                    <Text style={tailwind('text-gray-100')}>{order.getAttribute('notes') || 'N/A'}</Text>
                                </View>
                            </View>
                        </View>
                        {order.getAttribute('payload.entities', []).length > 0 && (
                            <View>
                                <View style={tailwind('flex flex-col items-center')}>
                                    <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700')}>
                                        <View style={tailwind('flex flex-row items-center')}>
                                            <Text style={tailwind('font-semibold text-gray-100')}>Payload</Text>
                                        </View>
                                    </View>
                                    <View>
                                        {isMultiDropOrder ? (
                                            <View style={tailwind('flex flex-row flex-wrap')}>
                                                {isArray(entitiesByDestination) &&
                                                    entitiesByDestination.map((group, i) => (
                                                        <View key={i} style={tailwind('w-full')}>
                                                            <View style={tailwind('rounded-md p-4 mb-4 border-b border-gray-700')}>
                                                                <View style={tailwind('mb-3')}>
                                                                    <Text style={tailwind('text-gray-100 text-sm mb-1')}>Items drop at</Text>
                                                                    <Text style={tailwind('text-gray-100 font-bold')}>{group.waypoint.address}</Text>
                                                                </View>
                                                                <View style={tailwind('w-full flex flex-row flex-wrap items-start')}>
                                                                    {isArray(group.entities) &&
                                                                        group.entities.map((entity, ii) => (
                                                                            <View key={ii} style={tailwind('w-40')}>
                                                                                <View style={tailwind('pb-2 pr-2')}>
                                                                                    <TouchableOpacity
                                                                                        onPress={() => navigation.push('EntityScreen', { _entity: entity, _order: order.serialize() })}>
                                                                                        <View
                                                                                            style={tailwind('flex items-center justify-center py-4 px-1 border border-gray-700 rounded-md')}>
                                                                                            <FastImage
                                                                                                source={{ uri: entity.photo_url }}
                                                                                                style={{ width: 50, height: 50, marginBottom: 5 }}
                                                                                            />
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
                                            <View style={tailwind('p-4')}>
                                                <View style={tailwind('flex flex-row flex-wrap items-start')}>
                                                    {order.getAttribute('payload.entities', []).map((entity, i) => (
                                                        <View key={i} style={tailwind('w-40')}>
                                                            <View style={tailwind('p-1')}>
                                                                <TouchableOpacity onPress={() => navigation.push('EntityScreen', { _entity: entity, _order: order.serialize() })}>
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
                                        )}
                                    </View>
                                </View>
                            </View>
                        )}
                        <View style={tailwind('mt-2')}>
                            <View style={tailwind('flex flex-col items-center')}>
                                <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700')}>
                                    <View style={tailwind('flex flex-row items-center')}>
                                        <Text style={tailwind('font-semibold text-gray-100')}>Documents & Files</Text>
                                    </View>
                                </View>
                                <View style={tailwind('w-full p-4 flex items-start flex-row  ')}>{documents.map((document, index) => renderDocumentItem(document, index))}</View>
                            </View>
                        </View>
                        {isArray(order.getAttribute('payload.entities', [])) && order.getAttribute('payload.entities', []).length > 0 && (
                            <View>
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
                                            {isArray(order.getAttribute('payload.entities', [])) &&
                                                order.getAttribute('payload.entities', []).map((entity, index) => (
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
                                                                {entity.meta?.variants?.map(variant => (
                                                                    <View key={variant.id}>
                                                                        <Text style={tailwind('text-xs text-gray-200')}>{variant.name}</Text>
                                                                    </View>
                                                                ))}
                                                            </View>
                                                            <View>
                                                                {entity.meta?.addons?.map(addon => (
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
                                                <Text style={tailwind('text-gray-100')}>{formatCurrency(calculateEntitiesSubtotal() / 100, currency)}</Text>
                                            </View>
                                            {!isPickupOrder && (
                                                <View style={tailwind('flex flex-row items-center justify-between mb-2')}>
                                                    <Text style={tailwind('text-gray-100')}>{translate('Shared.OrderScreen.deliveryFee')}</Text>
                                                    <Text style={tailwind('text-gray-100')}>{formatCurrency(calculateDeliverySubtotal() / 100, currency)}</Text>
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
                                                <Text style={tailwind('font-semibold text-white')}>{formatCurrency(calculateTotal() / 100, currency)}</Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        )}
                    </View>
                </View>
            </ScrollView>

            <ActionSheet
                ref={actionSheetRef}
                containerStyle={{ height: actionSheetHeight, backgroundColor: getColorCode('bg-gray-800') }}
                parentContainer={[tailwind('bg-gray-800')]}
                indicatorColor={getColorCode('bg-gray-900')}
                overlayColor={getColorCode('bg-gray-900')}
                gestureEnabled={true}
                bounceOnOpen={true}
                closeOnTouchBackdrop={false}
                nestedScrollEnabled={true}
                statusBarTranslucent={true}
                defaultOverlayOpacity={isLoadingAction ? 0.8 : 0.65}
                onMomentumScrollEnd={() => actionSheetRef.current?.handleChildScrollEnd()}>
                <View style={{ minHeight: 800 }}>
                    {actionSheetAction === 'update_activity' && (
                        <View style={tailwind('w-full h-full')}>
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
                                {!isEmpty(nextActivity) ? (
                                    <View style={tailwind('px-5')}>
                                        {isArray(nextActivity) &&
                                            nextActivity.map((activity, index) => (
                                                <View key={index} style={tailwind('mb-4')}>
                                                    <TouchableOpacity
                                                        style={[tailwind('btn bg-green-900 border border-green-700 px-4'), getStatusColors(activity.code, true).statusWrapperStyle]}
                                                        onPress={() => sendOrderActivityUpdate(activity)}>
                                                        {isLoadingActivity && <ActivityIndicator color={getColorCode('text-green-50')} style={tailwind('ml-8 mr-3')} />}
                                                        <View style={tailwind('w-full flex flex-col items-start py-2')}>
                                                            <Text style={tailwind(`font-bold text-lg text-${getStatusColors(activity.code).color}-50`)}>{activity.status}</Text>
                                                            <Text style={tailwind(`text-${getStatusColors(activity.code).color}-100`)}>{activity.details}</Text>
                                                            {activity.require_pod && (
                                                                <View style={tailwind('mt-3')}>
                                                                    <View
                                                                        style={tailwind('rounded-md px-2 py-1 bg-yellow-400 border border-yellow-700 shadow-sm flex flex-row items-center')}>
                                                                        <FontAwesomeIcon icon={faLightbulb} style={tailwind('text-yellow-900 mr-2')} />
                                                                        <Text style={tailwind('font-semibold text-yellow-900')}>Requires proof of delivery</Text>
                                                                    </View>
                                                                </View>
                                                            )}
                                                        </View>
                                                    </TouchableOpacity>
                                                </View>
                                            ))}
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
                    )}
                    {actionSheetAction === 'change_destination' && (
                        <View style={tailwind('w-full h-full')}>
                            <View style={tailwind('px-5 py-2 flex flex-row items-center justify-between mb-2')}>
                                <View style={tailwind('flex flex-row items-center')}>
                                    {isLoadingAction && <ActivityIndicator color={getColorCode('text-blue-300')} style={tailwind('mr-3')} />}
                                    <Text style={tailwind('text-lg font-semibold text-white')}>Change destination waypoint</Text>
                                </View>
                                <View>
                                    <TouchableOpacity onPress={() => actionSheetRef.current?.hide()} disabled={isLoadingAction}>
                                        <View style={tailwind(`rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center ${isLoadingAction ? 'opacity-50' : ''}`)}>
                                            <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            </View>
                            <ScrollView showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
                                <View style={tailwind('pb-64')}>
                                    {isArray(waypointsInProgress) &&
                                        waypointsInProgress.map((waypoint, index) => (
                                            <TouchableOpacity key={index} onPress={() => setOrderDestination(waypoint)} disabled={isLoadingAction} style={tailwind('mb-4 px-4')}>
                                                <View style={tailwind(`flex flex-row rounded-md bg-blue-900 border border-blue-700 ${isLoadingAction ? 'opacity-50' : ''}`)}>
                                                    <View style={tailwind('px-4 py-2 flex-1 flex flex-row')}>
                                                        <View style={tailwind('mr-4')}>
                                                            <View style={tailwind('rounded-full bg-blue-700 w-8 h-8 flex items-center justify-center')}>
                                                                <Text style={tailwind('font-bold text-white')}>{index + 1}</Text>
                                                            </View>
                                                        </View>
                                                        <View style={tailwind('flex-1')}>
                                                            <Text style={tailwind('text-blue-50')}>{waypoint.address}</Text>
                                                        </View>
                                                    </View>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                </View>
                            </ScrollView>
                        </View>
                    )}
                </View>
            </ActionSheet>
        </View>
    );
};

export default OrderScreen;
