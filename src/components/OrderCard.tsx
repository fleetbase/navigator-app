import React, { FC, useEffect, useState, useMemo } from 'react';
import { Pressable } from 'react-native';
import { YStack, XStack, Text, styled, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faBox } from '@fortawesome/free-solid-svg-icons';
import { formatDuration, titleize } from '../utils/format';
import { format as formatDate } from 'date-fns';
import useFleetbase from '../hooks/use-fleetbase';
import useOrderResource from '../hooks/use-order-resource';
import useAppTheme from '../hooks/use-app-theme';
import OrderProgressBar from './OrderProgressBar';
import LiveOrderRoute from './LiveOrderRoute';
import OrderWaypointList from './OrderWaypointList';
import MultipleCustomerAvatars from './MultipleCustomerAvatars';
import LoadingText from './LoadingText';
import Badge from './Badge';
import { translateLabel } from '../utils/localize';
import { useLanguage } from '../contexts/LanguageContext';

const INFO_FIELD_VALUE_MIN_HEIGHT = 30;
export const OrderCard = ({ order, onPress }) => {
    const theme = useTheme();
    const { isDarkMode } = useAppTheme();
    const { t } = useLanguage();
    const { trackerData } = useOrderResource(order, { loadEta: false });
    const waypointCustomers = useMemo(() => {
        const waypoints = order.getAttribute('payload.waypoints', []) ?? [];
        return waypoints
            .filter((waypoint) => waypoint.customer)
            .map((waypoint) => ({
                waypoint_id: waypoint.id,
                ...waypoint.customer,
            }));
    }, [order]);

    return (
        <Pressable onPress={onPress}>
            <YStack bg='$background' borderRadius='$4' borderWidth={1} borderColor='$borderColor' gap='$3'>
                <XStack justifyContent='space-between' px='$3' py='$3' bg='$background' borderTopLeftRadius='$4' borderTopRightRadius='$4' borderBottomWidth={1} borderColor='$borderColor'>
                    <XStack flex={1} gap='$2'>
                        <XStack borderRadius='$4' width={32} height={32} bg={isDarkMode ? '$info' : '$blue-600'} alignItems='center' justifyContent='center'>
                            <FontAwesomeIcon icon={faBox} color={isDarkMode ? theme.textPrimary.val : theme.surface.val} size={14} />
                        </XStack>
                        <YStack flex={1}>
                            <Text color='$textPrimary' fontSize={16} fontWeight='bold'>
                                {order.getAttribute('tracking_number.tracking_number')}
                            </Text>
                            <Text color='$textPrimary' fontSize={12}>
                                {formatDate(new Date(order.getAttribute('created_at')), 'PP HH:mm')}
                            </Text>
                        </YStack>
                    </XStack>
                    <XStack>
                        <Badge status={order.getAttribute('status')} />
                    </XStack>
                </XStack>
                <YStack px='$3' pb='$1' gap='$3'>
                    <YStack>
                        <LiveOrderRoute
                            order={order}
                            zoom={7}
                            height={150}
                            edgePaddingTop={70}
                            edgePaddingBottom={30}
                            edgePaddingLeft={30}
                            edgePaddingRight={30}
                            width='100%'
                            borderRadius='$4'
                            scrollEnabled={false}
                        />
                    </YStack>
                    <YStack>
                        <OrderWaypointList order={order} />
                    </YStack>
                    <OrderProgressBar
                        order={order}
                        progress={trackerData.progress_percentage}
                        firstWaypointCompleted={trackerData.first_waypoint_completed}
                        lastWaypointCompleted={trackerData.last_waypoint_completed}
                    />
                    <XStack>
                        <YStack flex={1}>
                            <XStack>
                                <YStack flex={1} gap='$2'>
                                    <YStack flex={1} gap='$1'>
                                        <Text color='$textPrimary' fontSize={12}>
                                            {waypointCustomers.length > 0 ? t('OrderCard.customers') : t('OrderCard.customer')}
                                        </Text>
                                        <YStack minHeight={INFO_FIELD_VALUE_MIN_HEIGHT}>
                                            {waypointCustomers.length > 0 ? (
                                                <YStack flex={1}>
                                                    <MultipleCustomerAvatars customers={waypointCustomers} />
                                                </YStack>
                                            ) : (
                                                <>
                                                    {order.getAttribute('customer') ? (
                                                        <>
                                                            <LoadingText text={order.getAttribute('customer.name')} numberOfLines={1} color='$textSecondary' fontSize={12} />
                                                            <LoadingText
                                                                text={order.getAttribute('customer.phone') || order.getAttribute('customer.email')}
                                                                numberOfLines={1}
                                                                color='$textSecondary'
                                                                fontSize={12}
                                                            />
                                                        </>
                                                    ) : (
                                                        <Text color='$textSecondary' fontSize={12}>
                                                            {t('common.notAvailable')}
                                                        </Text>
                                                    )}
                                                </>
                                            )}
                                        </YStack>
                                    </YStack>
                                    <YStack flex={1} gap='$1'>
                                        <Text color='$textPrimary' fontSize={12}>
                                            {t('OrderCard.dateScheduled')}
                                        </Text>
                                        <YStack minHeight={INFO_FIELD_VALUE_MIN_HEIGHT}>
                                            <LoadingText
                                                text={order.getAttribute('scheduled_at') ? formatDate(new Date(order.getAttribute('scheduled_at')), 'PP HH:mm') : t('common.notAvailable')}
                                                numberOfLines={1}
                                                color='$textSecondary'
                                                fontSize={12}
                                            />
                                        </YStack>
                                    </YStack>
                                </YStack>
                                <YStack flex={1} gap='$2'>
                                    <YStack flex={1} gap='$1'>
                                        <Text color='$textPrimary' fontSize={12}>
                                            {t('OrderCard.podRequired')}
                                        </Text>
                                        <YStack minHeight={INFO_FIELD_VALUE_MIN_HEIGHT}>
                                            <LoadingText
                                                text={
                                                    order.getAttribute('pod_required')
                                                        ? translateLabel('podMethods', order.getAttribute('pod_method'), titleize(order.getAttribute('pod_method')))
                                                        : t('common.notAvailable')
                                                }
                                                numberOfLines={1}
                                                color='$textSecondary'
                                                fontSize={12}
                                            />
                                        </YStack>
                                    </YStack>
                                    <YStack flex={1} gap='$1'>
                                        <Text color='$textPrimary' fontSize={12}>
                                            {t('OrderCard.dispatchedAt')}
                                        </Text>
                                        <YStack minHeight={INFO_FIELD_VALUE_MIN_HEIGHT}>
                                            <LoadingText
                                                text={order.getAttribute('dispatched_at') ? formatDate(new Date(order.getAttribute('dispatched_at')), 'PP HH:mm') : t('common.notAvailable')}
                                                numberOfLines={1}
                                                color='$textSecondary'
                                                fontSize={12}
                                            />
                                        </YStack>
                                    </YStack>
                                </YStack>
                                <YStack flex={1} gap='$2'>
                                    <YStack flex={1} gap='$1'>
                                        <Text color='$textPrimary' fontSize={12}>
                                            {t('OrderCard.eta')}
                                        </Text>
                                        <YStack minHeight={INFO_FIELD_VALUE_MIN_HEIGHT}>
                                            <LoadingText
                                                text={trackerData.current_destination_eta === -1 ? t('common.notAvailable') : formatDuration(trackerData.current_destination_eta)}
                                                numberOfLines={1}
                                                color='$textSecondary'
                                                fontSize={12}
                                            />
                                        </YStack>
                                    </YStack>
                                    <YStack flex={1} gap='$1'>
                                        <Text color='$textPrimary' fontSize={12}>
                                            {t('OrderCard.ect')}
                                        </Text>
                                        <YStack minHeight={INFO_FIELD_VALUE_MIN_HEIGHT}>
                                            <LoadingText text={trackerData.estimated_completion_time_formatted} numberOfLines={1} color='$textSecondary' fontSize={12} />
                                        </YStack>
                                    </YStack>
                                </YStack>
                            </XStack>
                        </YStack>
                    </XStack>
                </YStack>
            </YStack>
        </Pressable>
    );
};

export default OrderCard;
