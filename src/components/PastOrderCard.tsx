import React, { FC, useEffect, useState, useMemo } from 'react';
import { Pressable } from 'react-native';
import { YStack, XStack, Text, styled, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faBox, faLocationDot } from '@fortawesome/free-solid-svg-icons';
import { formatDuration, titleize, formatWhatsAppTimestamp } from '../utils/format';
import { Place } from '@fleetbase/sdk';
import { format as formatDate } from 'date-fns';
import useFleetbase from '../hooks/use-fleetbase';
import useOrderResource from '../hooks/use-order-resource';
import useAppTheme from '../hooks/use-app-theme';
import OrderProgressBar from './OrderProgressBar';
import LiveOrderRoute from './LiveOrderRoute';
import OrderWaypointList, { WaypointItem } from './OrderWaypointList';
import MultipleCustomerAvatars from './MultipleCustomerAvatars';
import LoadingText from './LoadingText';
import Badge from './Badge';

const INFO_FIELD_VALUE_MIN_HEIGHT = 30;
export const PastOrderCard = ({ order, onPress }) => {
    const theme = useTheme();
    const { isDarkMode } = useAppTheme();
    const { trackerData } = useOrderResource(order, { loadEta: false });

    const destination = useMemo(() => {
        const pickup = order.getAttribute('payload.pickup');
        const waypoints = order.getAttribute('payload.waypoints', []) ?? [];
        const dropoff = order.getAttribute('payload.dropoff');
        const currentWaypoint = order.getAttribute('payload.current_waypoint');
        const locations = [pickup, ...waypoints, dropoff].filter(Boolean);
        const destination = locations.find((place) => place?.id === currentWaypoint) ?? locations[0];

        return new Place(destination);
    }, [order]);

    return (
        <Pressable onPress={onPress}>
            <YStack bg='$background' borderRadius='$4' borderWidth={1} borderColor={isDarkMode ? '$borderColor' : '$borderColorWithShadow'}>
                <YStack height={150} mb='$3' borderBottomWidth={1} borderColor={isDarkMode ? '$background' : '$borderColorWithShadow'}>
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
                    <XStack bg='$background' alignItems='center' justifyContent='space-between' px='$2' mb='$3'>
                        <XStack flex={1} gap='$2'>
                            <XStack borderRadius='$4' width={34} height={34} bg={isDarkMode ? '$info' : '$blue-600'} alignItems='center' justifyContent='center'>
                                <FontAwesomeIcon icon={faBox} color={isDarkMode ? theme.textPrimary.val : theme.surface.val} size={14} />
                            </XStack>
                            <YStack flex={1}>
                                <Text color='$textPrimary' fontSize={16} fontWeight='bold'>
                                    {order.getAttribute('tracking_number.tracking_number')}
                                </Text>
                                <Text color='$textPrimary' fontSize={13}>
                                    {formatWhatsAppTimestamp(new Date(order.getAttribute('created_at')))}
                                </Text>
                            </YStack>
                        </XStack>
                        <XStack>
                            <Badge status={order.getAttribute('status')} />
                        </XStack>
                    </XStack>
                    <YStack px='$2' mb='$2'>
                        <OrderProgressBar
                            order={order}
                            progress={trackerData.progress_percentage}
                            firstWaypointCompleted={trackerData.first_waypoint_completed}
                            lastWaypointCompleted={trackerData.last_waypoint_completed}
                        />
                    </YStack>
                    <YStack px='$2'>
                        <WaypointItem
                            icon={faLocationDot}
                            iconColor={theme['$textPrimary'].val}
                            waypoint={destination.serialize()}
                            title='Current Destination'
                            titleStyle={{ fontWeight: 'bold', fontSize: 14, textTransform: 'uppercase' }}
                        />
                    </YStack>
                </YStack>
            </YStack>
        </Pressable>
    );
};

export default PastOrderCard;
