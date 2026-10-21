import React, { FC, useEffect, useState, useMemo, useCallback } from 'react';
import { Pressable, Alert } from 'react-native';
import { YStack, XStack, Text, Button, Spinner, styled, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faBox, faLocationDot, faBan, faCheck } from '@fortawesome/free-solid-svg-icons';
import { formatDuration, formatMeters, titleize, formatWhatsAppTimestamp } from '../utils/format';
import { getDistance } from '../utils/location';
import { Place } from '@fleetbase/sdk';
import { format as formatDate } from 'date-fns';
import { useLocation } from '../contexts/LocationContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import useAppTheme from '../hooks/use-app-theme';
import useFleetbase from '../hooks/use-fleetbase';
import OrderProgressBar from './OrderProgressBar';
import LiveOrderRoute from './LiveOrderRoute';
import OrderWaypointList, { WaypointItem } from './OrderWaypointList';
import MultipleCustomerAvatars from './MultipleCustomerAvatars';
import LoadingText from './LoadingText';
import LoadingOverlay from './LoadingOverlay';
import Badge from './Badge';

const INFO_FIELD_VALUE_MIN_HEIGHT = 30;
export const AdhocOrderCard = ({ order, onPress, onAccept, onDismiss }) => {
    const theme = useTheme();
    const { adapter } = useFleetbase();
    const { driver } = useAuth();
    const { location } = useLocation();
    const { isDarkMode } = useAppTheme();
    const { t } = useLanguage();
    const [isAccepting, setIsAccepting] = useState(false);

    const destination = useMemo(() => {
        const pickup = order.getAttribute('payload.pickup');
        const waypoints = order.getAttribute('payload.waypoints', []) ?? [];
        const dropoff = order.getAttribute('payload.dropoff');
        const currentWaypoint = order.getAttribute('payload.current_waypoint');
        const locations = [pickup, ...waypoints, dropoff].filter(Boolean);
        const destination = locations.find((place) => place?.id === currentWaypoint) ?? locations[0];

        return new Place(destination);
    }, [order]);

    const distance = useMemo(() => {
        return getDistance([location.coords.latitude, location.coords.longitude], destination);
    }, [location, destination]);

    const handleAccept = useCallback(async () => {
        Alert.alert(t('OrderScreen.acceptAdhocOrderTitle'), t('OrderScreen.acceptAdhocOrderPrompt'), [
            {
                text: t('common.cancel'),
                style: 'cancel',
            },
            {
                text: t('OrderScreen.accept'),
                onPress: async () => {
                    setIsAccepting(true);

                    try {
                        await order.start({ assign: driver.id });
                        if (typeof onAccept === 'function') {
                            onAccept(order);
                        }
                    } catch (err) {
                        console.warn('Error assigning driver to ad-hoc order:', err);
                    } finally {
                        setIsAccepting(false);
                    }
                },
            },
        ]);
    }, [order, setIsAccepting]);

    const handleDismiss = useCallback(() => {
        Alert.alert(t('OrderScreen.dismissAdhocOrderTitle'), t('OrderScreen.dismissAdhocOrderPrompt'), [
            {
                text: t('common.cancel'),
                style: 'cancel',
            },
            {
                text: t('common.ok'),
                onPress: () => {
                    if (typeof onDismiss === 'function') {
                        onDismiss(order);
                    }
                },
            },
        ]);
    }, [order]);

    return (
        <Pressable onPress={onPress}>
            <LoadingOverlay isVisible={isAccepting} text={t('AdhocOrderCard.acceptingOrder')} />
            <YStack bg='$info' borderRadius='$4' borderWidth={1} borderColor='$infoBorder'>
                <YStack height={150} borderBottomWidth={1} borderColor='$infoBorder'>
                    <LiveOrderRoute
                        order={order}
                        focusCurrentDestination={true}
                        zoom={7}
                        height={150}
                        edgePaddingTop={70}
                        edgePaddingBottom={30}
                        edgePaddingLeft={30}
                        edgePaddingRight={30}
                        width='100%'
                        borderRadius='$4'
                        borderBottomLeftRadius={0}
                        borderBottomRightRadius={0}
                        scrollEnabled={false}
                    />
                </YStack>
                <YStack flex={1} borderRadius='$4'>
                    <XStack bg='$blue-800' alignItems='center' px='$3' py='$3' mb='$3' borderBottomWidth={1} borderColor='$infoBorder'>
                        <Text color='$infoText' fontSize='$6' fontWeight='bold'>
                            {t('AdhocOrderCard.orderAvailableNearby', { distance: formatMeters(distance) })}
                        </Text>
                    </XStack>
                    <XStack alignItems='start' justifyContent='space-between' px='$3' mb='$3'>
                        <XStack flex={1} gap='$2'>
                            <XStack borderRadius='$4' width={34} height={34} bg='$background' alignItems='center' justifyContent='center'>
                                <FontAwesomeIcon icon={faBox} color={theme.textPrimary.val} size={14} />
                            </XStack>
                            <YStack flex={1}>
                                <Text color='$textPrimary' fontSize={16} fontWeight='bold'>
                                    {order.getAttribute('tracking_number.tracking_number')}
                                </Text>
                                <Text color='$textPrimary' fontSize={13}>
                                    {formatWhatsAppTimestamp(new Date(order.getAttribute('created_at')))}
                                </Text>
                                <Text color='$textPrimary' fontSize={13}>
                                    {t('AdhocOrderCard.distanceAway', { distance: formatMeters(distance) })}
                                </Text>
                            </YStack>
                        </XStack>
                        <XStack alignSelf='flex-start'>
                            <Badge status={order.getAttribute('status')} />
                        </XStack>
                    </XStack>
                    <YStack px='$3'>
                        <WaypointItem
                            icon={faLocationDot}
                            iconColor={theme['$textPrimary'].val}
                            waypoint={destination.serialize()}
                            title={t('AdhocOrderCard.pickupDestination')}
                            titleStyle={{ fontWeight: 'bold', fontSize: 14, textTransform: 'uppercase' }}
                        />
                    </YStack>
                    <XStack px='$3' pb='$3' gap='$2'>
                        <YStack flex={1}>
                            <Button onPress={handleAccept} bg='$success' borderColor='$successBorder' borderWidth={1} disabled={isAccepting}>
                                <Button.Icon>{isAccepting ? <Spinner color='$successText' /> : <FontAwesomeIcon icon={faCheck} color={theme['$successText'].val} />}</Button.Icon>
                                <Button.Text color='$successText'>{t('OrderScreen.acceptOrder')}</Button.Text>
                            </Button>
                        </YStack>
                        <YStack flex={1}>
                            <Button onPress={handleDismiss} bg='$error' borderColor='$errorBorder' borderWidth={1} disabled={isAccepting}>
                                <Button.Icon>
                                    <FontAwesomeIcon icon={faBan} color={theme['$errorText'].val} />
                                </Button.Icon>
                                <Button.Text color='$errorText'>{t('OrderScreen.dismissOrder')}</Button.Text>
                            </Button>
                        </YStack>
                    </XStack>
                </YStack>
            </YStack>
        </Pressable>
    );
};

export default AdhocOrderCard;
