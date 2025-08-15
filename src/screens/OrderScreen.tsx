import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ScrollView, RefreshControl, SafeAreaView, StyleSheet, Alert, Platform } from 'react-native';
import { Separator, Button, Image, Stack, Text, YStack, XStack, Spinner, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPaperPlane, faPenToSquare, faFlagCheckered, faCheck, faBan } from '@fortawesome/free-solid-svg-icons';
import { BlurView } from '@react-native-community/blur';
import { PortalHost } from '@gorhom/portal';
import LaunchNavigator from 'react-native-launch-navigator';
import FastImage from 'react-native-fast-image';
import { Order, Place } from '@fleetbase/sdk';
import { format as formatDate, formatDistance, add } from 'date-fns';
import { titleize } from 'inflected';
import { formatCurrency, formatMeters, formatDuration, smartHumanize } from '../utils/format';
import { restoreFleetbasePlace, getCoordinates } from '../utils/location';
import { toast } from '../utils/toast';
import { config, showActionSheet } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useOrderManager } from '../contexts/OrderManagerContext';
import { useTempStore } from '../contexts/TempStoreContext';
import useSocketClusterClient from '../hooks/use-socket-cluster-client';
import useStorage from '../hooks/use-storage';
import useAppTheme from '../hooks/use-app-theme';
import useOrderResource from '../hooks/use-order-resource';
import usePromiseWithLoading from '../hooks/use-promise-with-loading';
import useFleetbase from '../hooks/use-fleetbase';
import LiveOrderRoute from '../components/LiveOrderRoute';
import PlaceCard from '../components/PlaceCard';
import OrderItems from '../components/OrderItems';
import OrderTotal from '../components/OrderTotal';
import OrderWaypointList from '../components/OrderWaypointList';
import OrderPayloadEntities from '../components/OrderPayloadEntities';
import OrderDocumentFiles from '../components/OrderDocumentFiles';
import OrderCustomerCard from '../components/OrderCustomerCard';
import OrderProgressBar from '../components/OrderProgressBar';
import OrderCommentThread from '../components/OrderCommentThread';
import OrderProofOfDelivery from '../components/OrderProofOfDelivery';
import CurrentDestinationSelect from '../components/CurrentDestinationSelect';
import OrderActivitySelect from '../components/OrderActivitySelect';
import LoadingOverlay from '../components/LoadingOverlay';
import DestinationChangedAlert from '../components/DestinationChangedAlert';
import Badge from '../components/Badge';
import Spacer from '../components/Spacer';
import BackButton from '../components/BackButton';
import { SectionHeader, SectionInfoLine, ActionContainer } from '../components/Content';

const getOrderDestination = (order, adapter) => {
    const pickup = order.getAttribute('payload.pickup');
    const waypoints = order.getAttribute('payload.waypoints', []) ?? [];
    const dropoff = order.getAttribute('payload.dropoff');
    const currentWaypoint = order.getAttribute('payload.current_waypoint');
    const locations = [pickup, ...waypoints, dropoff].filter(Boolean);
    const destination = locations.find((place) => place?.id === currentWaypoint) ?? locations[0];

    return new Place(destination, adapter);
};

const isOldAndroid = Platform.OS === 'android' && Platform.Version <= 31;
const OrderScreen = ({ route }) => {
    const params = route.params || {};
    const theme = useTheme();
    const navigation = useNavigation();
    const { t } = useLanguage();
    const { adapter } = useFleetbase();
    const { isDarkMode } = useAppTheme();
    const { driver } = useAuth();
    const { location } = useLocation();
    const { listen } = useSocketClusterClient();
    const { runWithLoading, isLoading } = usePromiseWithLoading();
    const { updateStorageOrder, setDimissedOrders } = useOrderManager();
    const { store, removeValue } = useTempStore();
    const [order, setOrder] = useState(new Order(params.order, adapter));
    const [activityLoading, setActivityLoading] = useState();
    const [distanceMatrix, setDistanceMatrix] = useState();
    const [nextActivity, setNextActivity] = useState([]);
    const [loadingOverlayMessage, setLoadingOverlayMessage] = useState();
    const [currentDestination, setCurrentDestination] = useState();
    const [isAccepting, setIsAccepting] = useState(false);
    const memoizedOrder = useMemo(() => order, [order?.id]);
    const { trackerData } = useOrderResource(memoizedOrder, { loadEta: false });
    const distanceLoadedRef = useRef(false);
    const isUpdatingActivity = useRef(false);
    const listenerRef = useRef();
    const activitySheetRef = useRef();
    const isAdhoc = order.getAttribute('adhoc') === true;
    const isIncomingAdhoc = isAdhoc && order.getAttribute('driver_assigned') === null;
    const isDriverAssigned = order.getAttribute('driver_assigned') !== null;
    const isOrderPing = isDriverAssigned === false && isAdhoc === true && !['completed', 'canceled'].includes(order.getAttribute('status'));
    const isNotStarted = order.isNotStarted && !order.isCanceled && !isOrderPing && order.getAttribute('status') !== 'completed';
    const isNavigatable = (order.isDispatched || order.isInProgress) && !['completed', 'canceled'].includes(order.getAttribute('status')) && !isIncomingAdhoc;
    const isMultipleWaypointOrder = (order.getAttribute('payload.waypoints', []) ?? []).length > 0;
    const customFieldKeys = order.getAttribute('custom_fields', []) ?? [];
    const showLoadingOverlay = isLoading('activityUpdate');
    // Alert destination changed state
    const [showDestAlert, setShowDestAlert] = useState(false);
    const [prevDest, setPrevDest] = useState<any>(null);
    const [currDest, setCurrDest] = useState<any>(null);

    const destination = useMemo(() => {
        const pickup = order.getAttribute('payload.pickup');
        const waypoints = order.getAttribute('payload.waypoints', []) ?? [];
        const dropoff = order.getAttribute('payload.dropoff');
        const currentWaypoint = order.getAttribute('payload.current_waypoint');
        const locations = [pickup, ...waypoints, dropoff].filter(Boolean);
        const destination = locations.find((place) => place?.id === currentWaypoint) ?? locations[0];

        return new Place(destination, adapter);
    }, [order, adapter]);

    const entitiesByDestination = useMemo(() => {
        const waypoints = order.getAttribute('payload.waypoints', []) ?? [];
        const entities = order.getAttribute('payload.entities', []) ?? [];

        // Return an empty array if there are no waypoints.
        if (!waypoints || waypoints.length === 0) {
            return [];
        }

        // Build the groups based on destination id.
        return waypoints.reduce((groups, waypoint) => {
            const destination = waypoint?.id;
            if (destination) {
                const destinationEntities = entities.filter((entity) => entity.destination === destination);
                if (destinationEntities.length > 0) {
                    groups.push({
                        destination,
                        waypoint,
                        entities: destinationEntities,
                    });
                }
            }
            return groups;
        }, []);
    }, [order]);

    const waypointsInProgress = useMemo(() => {
        const waypoints = order.getAttribute('payload.waypoints', []) ?? [];
        const statusesToSkip = ['completed', 'canceled'];

        if (waypoints.length === 0) {
            const pickup = restoreFleetbasePlace(order.getAttribute('payload.pickup'), adapter);
            const dropoff = restoreFleetbasePlace(order.getAttribute('payload.dropoff'), adapter);

            return [pickup, dropoff];
        }

        return waypoints
            .filter((waypoint) => {
                // Ensure waypoint.tracking exists and isn't one of the skipped statuses.
                return waypoint?.tracking && !statusesToSkip.includes(waypoint.tracking.toLowerCase());
            })
            .map((waypoint) => restoreFleetbasePlace(waypoint, adapter));
    }, [order, adapter]);

    const startNavigation = useCallback(async () => {
        if (Platform.OS === 'android') {
            LaunchNavigator.setGoogleApiKey(config('GOOGLE_MAPS_API_KEY'));
        }

        const apps = await LaunchNavigator.getAvailableApps();
        const availableApps = Object.keys(apps).filter((appName) => apps[appName] === true);

        showActionSheet({
            options: [...availableApps.map((appName) => LaunchNavigator.APP_NAMES[appName]), t('common.cancel')],
            cancelButtonIndex: availableApps.length,
            onSelect: async (buttonIndex) => {
                if (buttonIndex === availableApps.length) return;

                const app = availableApps[buttonIndex];
                const destinationCoordinates = getCoordinates(destination);

                try {
                    await LaunchNavigator.navigate(destinationCoordinates, {
                        app,
                        launchMode: LaunchNavigator.LAUNCH_MODE.TURN_BY_TURN,
                        destinationName: destination.getAttribute('name') ?? destination.getAttribute('street1'),
                    });
                } catch (err) {
                    console.warn('Error launching navigation:', err);
                }
            },
        });
    }, [destination]);

    const alertDestinationChanged = (previousDestination, currentDestination, order) => {
        return Alert.alert(
            'Waypoint Completed',
            `Waypoint activity completed for destination ${previousDestination.getAttribute('address')}. Your current destination is now ${currentDestination.getAttribute('address')}. You can change the destination at anytime by pressing the "Current Destination" button.`,
            [
                {
                    text: 'Continue',
                    isPreferred: true,
                    onPress: () => {
                        return startOrder({ skipDispatch: true });
                    },
                },
            ]
        );
    };

    const updateOrder = useCallback(
        (order) => {
            setOrder(order);
            updateStorageOrder(order.serialize(), ['current', 'active', 'recent']);
        },
        [setOrder, updateStorageOrder]
    );

    const getDistanceMatrix = useCallback(async () => {
        if (distanceLoadedRef.current) return;
        try {
            const distanceMatrixData = await order.getDistanceAndTime();
            setDistanceMatrix(distanceMatrixData);
            distanceLoadedRef.current = true;
        } catch (err) {
            console.warn('Error loading order distance matrix:', err);
        }
    }, [order]);

    const reloadOrder = useCallback(async () => {
        try {
            const reloadedOrder = await runWithLoading(order.reload(), 'isReloading');
            updateOrder(reloadedOrder);
            distanceLoadedRef.current = false;
        } catch (err) {
            console.warn('Error reloading order:', err);
        }
    }, [order]);

    const setOrderDestination = useCallback(
        async (waypoint) => {
            if (!waypoint) {
                return;
            }

            try {
                const updatedOrder = await runWithLoading(order.setDestination(waypoint.id), 'setOrderDestination');
                updateOrder(updatedOrder);
            } catch (err) {
                console.warn('Error changing order destination:', err);
            }
        },
        [order]
    );

    const startOrder = useCallback(
        async (params = {}) => {
            isUpdatingActivity.current = true;

            try {
                const updatedOrder = await runWithLoading(order.start(params), 'startOrder');
                updateOrder(updatedOrder);
            } catch (err) {
                console.warn('Error starting order:', err, err.message);
                const errorMessage = err.message ?? '';
                if (errorMessage.startsWith('Order has not been dispatched')) {
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
                                return reloadOrder();
                            },
                        },
                    ]);
                }
            } finally {
                isUpdatingActivity.current = false;
            }
        },
        [order, adapter]
    );

    const updateOrderActivity = useCallback(async () => {
        activitySheetRef.current?.openBottomSheet();

        try {
            const activity = await runWithLoading(order.getNextActivity({ waypoint: destination?.id }), 'nextOrderActivity');
            if (activity.code === 'dispatched') {
                return Alert.alert('Warning!', 'This order is not yet dispatched, are you sure you want to continue?', [
                    {
                        text: 'Yes',
                        onPress: async () => {
                            try {
                                const updatedOrder = await order.updateActivity({ skipDispatch: true });
                                updateOrder(updatedOrder);
                            } catch (err) {
                                console.warn('Error updating order activity:', err);
                            }
                        },
                    },
                    {
                        text: 'Cancel',
                        onPress: () => {
                            return reloadOrder();
                        },
                    },
                ]);
            }

            setNextActivity(activity);
        } catch (err) {
            console.warn('Error fetching next activity for order:', err);
        }
    }, [order]);

    const sendOrderActivityUpdate = useCallback(
        async (activity, proof) => {
            setActivityLoading(activity.code);

            if (activity.require_pod && !proof) {
                activitySheetRef.current?.closeBottomSheet();
                return navigation.navigate('ProofOfDelivery', { activity, order: order.serialize(), waypoint: destination.serialize() });
            }

            // Track current destination
            const previousDestination = getOrderDestination(order, adapter);

            isUpdatingActivity.current = true;
            setLoadingOverlayMessage(`Updating Activity: ${activity._resolved_status ?? activity.status}`);

            try {
                const updatedOrder = await runWithLoading(order.updateActivity({ activity, proof: proof?.id }), 'activityUpdate');
                updateOrder(updatedOrder);
                setNextActivity([]);
                setLoadingOverlayMessage(null);
                toast.success(`Order status updated to: ${activity._resolved_status ?? activity.status}`);

                const currentDestination = getOrderDestination(updatedOrder, adapter);
                const shouldNotifyUserDestinationChanged = activity.complete && updatedOrder.status !== 'completed' && previousDestination?.id !== currentDestination?.id;
                if (shouldNotifyUserDestinationChanged) {
                    setPrevDest(previousDestination);
                    setCurrDest(currentDestination);
                    setShowDestAlert(true);
                }
            } catch (err) {
                console.warn('Error updating order activity:', err);
            } finally {
                isUpdatingActivity.current = false;
                setActivityLoading(null);
                setLoadingOverlayMessage(null);
                activitySheetRef.current?.closeBottomSheet();
            }
        },
        [order]
    );

    const completeOrder = useCallback(
        async (activity) => {
            setActivityLoading(activity.code);
            isUpdatingActivity.current = true;

            try {
                const updatedOrder = await runWithLoading(order.complete(), 'completeOrder');
                updateOrder(updatedOrder);
                setNextActivity([]);
            } catch (err) {
                console.warn('Error updating order activity:', err);
            } finally {
                isUpdatingActivity.current = false;
                setActivityLoading(null);
            }
        },
        [order]
    );

    const handleAdhocAccept = useCallback(async () => {
        Alert.alert('Accept Ad-Hoc order?', 'By accepting this ad-hoc order it will become assigned to you and the order will start immediatley.', [
            {
                text: 'Cancel',
                style: 'cancel',
            },
            {
                text: 'Accept',
                onPress: async () => {
                    setIsAccepting(true);

                    try {
                        const startedOrder = await order.start({ assign: driver.id });
                        setOrder(startedOrder);
                    } catch (err) {
                        console.warn('Error assigning driver to ad-hoc order:', err);
                    } finally {
                        setIsAccepting(false);
                    }
                },
            },
        ]);
    }, [order, driver, setIsAccepting]);

    const handleAdhocDismissal = useCallback(() => {
        Alert.alert('Dismiss Ad-Hoc order?', 'By dimissing this ad-hoc order it will no longer display as an available order.', [
            {
                text: 'Cancel',
                style: 'cancel',
            },
            {
                text: 'OK',
                onPress: () => {
                    setDimissedOrders((prevDismissedOrders) => [...prevDismissedOrders, order.id]);
                    navigation.goBack();
                },
            },
        ]);
    }, [order, setDimissedOrders]);

    useEffect(() => {
        if (!order) return;
        // If order has no adapter set - this is not good
        if (!order.adapter) {
            setOrder(order.setAdapter(adapter));
        }
    }, [adapter]);

    useEffect(() => {
        if (order && !distanceLoadedRef.current) {
            getDistanceMatrix();
        }
    }, [order, getDistanceMatrix]);

    useEffect(() => {
        if (listenerRef.current) {
            return;
        }

        const listenForUpdates = async () => {
            const listener = await listen(`order.${order.id}`, (event) => {
                // only reload order if status changed
                // need to prevent duplicate reload if order is reloaded from updating activity
                if (isUpdatingActivity && isUpdatingActivity.current === true) {
                    return;
                }
                if (order.getAttribute('status') !== event.data.status) {
                    reloadOrder();
                }
            });
            if (listener) {
                listenerRef.current = listener;
            }
        };

        listenForUpdates();

        return () => {
            if (listenerRef.current) {
                listenerRef.current.stop();
            }
        };
    }, [listen, order.id]);

    useEffect(() => {
        const updateActivityWithProof = async (activity, proof) => {
            try {
                await sendOrderActivityUpdate(activity, proof);
            } catch (err) {
                console.warn('Error attempting to update activity with proof:', err);
            } finally {
                removeValue('proof');
            }
        };

        if (store.proof) {
            // Storage has new proof
            console.log('Temp store is containing recent proof!', store.proof);
            const { activity, proof } = store.proof;
            updateActivityWithProof(activity, proof);
        }
    }, [store.proof]);

    return (
        <YStack flex={1} bg='$background'>
            <DestinationChangedAlert
                visible={showDestAlert}
                previousDestination={prevDest}
                currentDestination={currDest}
                onClose={() => {
                    setShowDestAlert(false);
                }}
            />
            <ScrollView
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={isLoading('isReloading')} onRefresh={reloadOrder} tintColor={theme['$blue-500'].val} />}
            >
                <YStack position='relative' width='100%' height={350} borderBottomWidth={0} borderColor='$borderColorWithShadow'>
                    <YStack position='absolute' top={0} left={0} right={0} zIndex={1}>
                        <XStack bg='$info' borderBottomWidth={1} borderColor='$infoBorder' padding='$3' space='$2'>
                            <YStack>
                                <Image
                                    width={60}
                                    height={60}
                                    bg='white'
                                    padding='$1'
                                    borderRadius='$1'
                                    source={{ uri: `data:image/png;base64,${order.getAttribute('tracking_number.qr_code')}` }}
                                />
                            </YStack>
                            <XStack flex={1} justifyContent='space-between'>
                                <YStack flex={1}>
                                    <Text color={isDarkMode ? '$textPrimary' : '$gray-100'} fontSize={19} fontWeight='bold'>
                                        {order.getAttribute('tracking_number.tracking_number')}
                                    </Text>
                                    <Text color={isDarkMode ? '$textPrimary' : '$gray-200'} fontSize={15}>
                                        {formatDate(new Date(order.getAttribute('created_at')), 'PP HH:mm')}
                                    </Text>
                                </YStack>
                                <YStack>
                                    <Badge status={order.getAttribute('status')} />
                                </YStack>
                            </XStack>
                        </XStack>
                    </YStack>
                    <LiveOrderRoute
                        order={order}
                        zoom={4}
                        edgePaddingTop={80}
                        edgePaddingBottom={30}
                        edgePaddingLeft={30}
                        edgePaddingRight={30}
                        focusCurrentDestination={isMultipleWaypointOrder}
                        currentDestination={destination}
                    />
                </YStack>
                <ActionContainer space='$3'>
                    {isOldAndroid && showLoadingOverlay && (
                        <YStack>
                            <XStack alignItems='center' gap='$2' borderWidth={1} borderColor='$infoBorder' bg='$info' py='$2' px='$3' borderRadius='$5'>
                                <Spinner color='$infoText' />
                                <Text color='$infoText' fontSize='$4'>
                                    {loadingOverlayMessage}
                                </Text>
                            </XStack>
                        </YStack>
                    )}
                    <XStack space='$2' ml={-5}>
                        {isIncomingAdhoc && (
                            <XStack flex={1} space='$2' ml={5}>
                                <Button onPress={handleAdhocAccept} flex={1} bg='$success' borderWidth={1} borderColor='$successBorder' disabled={isAccepting}>
                                    <Button.Icon>{isAccepting ? <Spinner color='$successText' /> : <FontAwesomeIcon icon={faCheck} color={theme.successText.val} />}</Button.Icon>
                                    <Button.Text color='$successText'>Accept Order</Button.Text>
                                </Button>
                                <Button onPress={handleAdhocDismissal} flex={1} bg='$error' borderWidth={1} borderColor='$errorBorder' disabled={isAccepting}>
                                    <Button.Icon>
                                        <FontAwesomeIcon icon={faBan} color={theme.errorText.val} />
                                    </Button.Icon>
                                    <Button.Text color='$errorText'>Dismiss Order</Button.Text>
                                </Button>
                            </XStack>
                        )}
                        {isNotStarted && (
                            <Button onPress={() => startOrder()} bg='$success' borderWidth={1} borderColor='$successBorder'>
                                <Button.Icon>
                                    {isLoading('startOrder') ? <Spinner color='$successText' /> : <FontAwesomeIcon icon={faFlagCheckered} color={theme.successText.val} />}
                                </Button.Icon>
                                <Button.Text color='$successText'>Start Order</Button.Text>
                            </Button>
                        )}
                        {order.isInProgress && (
                            <Button onPress={() => updateOrderActivity()} bg='$success' borderWidth={1} borderColor='$successBorder'>
                                <Button.Icon>
                                    {isLoading('nextOrderActivity') ? <Spinner color='successText' /> : <FontAwesomeIcon icon={faPenToSquare} color={theme.infoText.val} />}
                                </Button.Icon>
                                <Button.Text color='$successText'>Update Activity</Button.Text>
                            </Button>
                        )}
                        {isNavigatable && (
                            <Button onPress={startNavigation} bg='$info' borderWidth={1} borderColor='$infoBorder'>
                                <Button.Icon>{isLoading('startNavigation') ? <Spinner color='$infoText' /> : <FontAwesomeIcon icon={faPaperPlane} color={theme.infoText.val} />}</Button.Icon>
                                <Button.Text color='$infoText'>Start Navigation</Button.Text>
                            </Button>
                        )}
                    </XStack>
                    {!isIncomingAdhoc && (
                        <YStack>
                            <CurrentDestinationSelect
                                destination={destination}
                                waypoints={waypointsInProgress}
                                onChange={setOrderDestination}
                                isLoading={isLoading('setOrderDestination')}
                                snapTo='80%'
                            />
                        </YStack>
                    )}
                </ActionContainer>
                <SectionHeader title='Order Information' />
                <YStack py='$4'>
                    <SectionInfoLine title='ID' value={order.id} />
                    <Separator />
                    <SectionInfoLine title='Internal ID' value={order.getAttribute('internal_id')} />
                    <Separator />
                    <SectionInfoLine title='Tracking Number' value={order.getAttribute('tracking_number.tracking_number')} />
                    <Separator />
                    <SectionInfoLine title='Proof of Delivery' value={order.getAttribute('pod_required') ? titleize(order.getAttribute('pod_method')) : 'N/A'} />
                    <Separator />
                    <SectionInfoLine title='Type' value={titleize(order.getAttribute('type'))} />
                    <Separator />
                    <SectionInfoLine title='Date Created' value={formatDate(new Date(order.getAttribute('created_at')), 'PP HH:mm')} />
                    <Separator />
                    <SectionInfoLine title='Date Scheduled' value={order.getAttribute('scheduled_at') ? formatDate(new Date(order.getAttribute('scheduled_at')), 'PP HH:mm') : '-'} />
                    <Separator />
                    <SectionInfoLine title='Date Dispatched' value={order.getAttribute('dispatched_at') ? formatDate(new Date(order.getAttribute('dispatched_at')), 'PP HH:mm') : '-'} />
                    {customFieldKeys.map((key, index) => (
                        <YStack key={index}>
                            <Separator />
                            <SectionInfoLine title={smartHumanize(key)} value={order.getAttribute(key)} />
                        </YStack>
                    ))}
                </YStack>
                <SectionHeader title='Order Route' />
                <YStack px='$3' py='$4'>
                    <OrderWaypointList order={order} />
                </YStack>
                <SectionHeader title='Order Progress' />
                <YStack>
                    <YStack px='$3' py='$4'>
                        <OrderProgressBar
                            order={order}
                            progress={trackerData.progress_percentage}
                            firstWaypointCompleted={trackerData.first_waypoint_completed}
                            lastWaypointCompleted={trackerData.last_waypoint_completed}
                        />
                    </YStack>
                    <YStack pb='$3'>
                        <SectionInfoLine title='Current Destination' value={trackerData.current_destination?.address} />
                        <Separator />
                        <SectionInfoLine title='Next Destination' value={trackerData.next_destination?.address} />
                        <Separator />
                        <SectionInfoLine title='Total Distance' value={formatMeters(trackerData.total_distance)} />
                        <Separator />
                        <SectionInfoLine title='Start Time' value={trackerData.start_time ? '-' : trackerData.start_time} />
                        <Separator />
                        <SectionInfoLine title='Current ETA' value={trackerData.current_destination_eta === -1 ? 'N/A' : formatDuration(trackerData.current_destination_eta)} />
                        <Separator />
                        <SectionInfoLine title='ECT' value={trackerData.estimated_completion_time_formatted} />
                    </YStack>
                </YStack>
                <SectionHeader title='Order Notes' />
                <YStack px='$3' py='$4'>
                    <Text color='$textPrimary'>{order.getAttribute('notes', 'N/A') ?? 'N/A'}</Text>
                </YStack>
                <SectionHeader title='Order Proof' />
                <YStack>
                    <OrderProofOfDelivery order={order} />
                </YStack>
                <SectionHeader title='Order Payload' />
                <YStack>
                    <OrderPayloadEntities order={order} onPress={({ entity, waypoint }) => navigation.navigate('Entity', { entity, waypoint })} />
                </YStack>
                {order.isAttributeFilled('customer') && (
                    <>
                        <SectionHeader title='Customer' />
                        <YStack px='$3' py='$4'>
                            <OrderCustomerCard customer={order.getAttribute('customer')} />
                        </YStack>
                    </>
                )}
                <SectionHeader title='Order Documents & Files' />
                <YStack>
                    <OrderDocumentFiles order={order} />
                </YStack>
                <SectionHeader title='Order Comments' />
                <YStack px='$2' py='$4'>
                    <OrderCommentThread order={order} />
                </YStack>
                <Spacer height={200} />
            </ScrollView>
            {isOldAndroid ? (
                <YStack />
            ) : (
                <LoadingOverlay
                    text={loadingOverlayMessage}
                    visible={showLoadingOverlay}
                    spinnerColor={isDarkMode ? '$textPrimary' : '$white'}
                    textColor={isDarkMode ? '$textPrimary' : '$white'}
                />
            )}
            <OrderActivitySelect
                ref={activitySheetRef}
                onChange={sendOrderActivityUpdate}
                waypoint={destination}
                activities={nextActivity}
                activityLoading={activityLoading}
                isLoading={isLoading('nextOrderActivity')}
                snapTo='80%'
                portalHost='OrderScreenPortal'
            />
            <PortalHost name='OrderScreenPortal' />
        </YStack>
    );
};

export default OrderScreen;
