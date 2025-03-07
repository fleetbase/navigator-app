import React, { useState } from 'react';
import { Linking } from 'react-native';
import { XStack, YStack, Text, Button } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faEye } from '@fortawesome/free-solid-svg-icons';
import Collapsible from 'react-native-collapsible';
import Badge from './Badge';
import { isArray, isEmpty } from '../utils';

const COLLAPSE_POINT = 2;
const CIRCLE_SIZE = 32;

interface WaypointCircleProps {
    number: number;
    backgroundColor: string;
}
const WaypointCircle: React.FC<WaypointCircleProps> = ({ number, backgroundColor, ...props }) => (
    <YStack mr='$3'>
        <YStack borderRadius={CIRCLE_SIZE} backgroundColor={backgroundColor} width={CIRCLE_SIZE} height={CIRCLE_SIZE} alignItems='center' justifyContent='center' {...props}>
            <Text fontWeight='bold' color='$successText'>
                {number}
            </Text>
        </YStack>
    </YStack>
);

interface WaypointItemProps {
    index: number;
    waypoint: any;
    textStyle?: any;
    onCall: (phone: string) => void;
    isLast?: boolean;
}
const WaypointItem: React.FC<WaypointItemProps> = ({ index, waypoint, textStyle, onCall, isLast = false }) => (
    <XStack alignItems='center' mb={isLast ? 0 : '$4'} width='100%'>
        <WaypointCircle number={index} backgroundColor='$success' borderWidth={1} borderColor='$successBorder' />
        <YStack flex={1}>
            <Text fontSize='$2' color='$textPrimary' textDecorationLine={waypoint.completed ? 'line-through' : 'none'} {...textStyle}>
                {waypoint.address}
            </Text>
            {waypoint.phone && (
                <Button onPress={() => onCall(waypoint.phone)} backgroundColor='transparent' padding={0}>
                    <Text fontSize='$2' color='gray' {...textStyle}>
                        {waypoint.phone}
                    </Text>
                </Button>
            )}
            {waypoint.tracking_number && (
                <XStack>
                    <Badge status={waypoint.tracking_number.status_code} />
                </XStack>
            )}
        </YStack>
    </XStack>
);

interface WaypointCollapseButtonProps {
    isCollapsed: boolean;
    toggleCollapse: () => void;
    count: number;
    textStyle?: any;
}
const WaypointCollapseButton: React.FC<WaypointCollapseButtonProps> = ({ isCollapsed, toggleCollapse, count, textStyle }) => (
    <XStack alignItems='center' mb='$4' width='100%'>
        <Button onPress={toggleCollapse} width='100%' backgroundColor='transparent' padding={0}>
            <YStack paddingHorizontal='$3' paddingVertical='$2' width='100%' backgroundColor='yellow' borderWidth={1} borderColor='yellow' borderRadius='$2' elevation={1}>
                <XStack alignItems='center'>
                    <FontAwesomeIcon icon={faEye} style={{ marginRight: 8, color: 'yellow' }} />
                    <Text fontWeight='bold' color='yellow' {...textStyle}>
                        {isCollapsed ? 'Tap to expand' : 'Tap to collapse'}
                    </Text>
                </XStack>
                <Text color='yellow' {...textStyle}>
                    {count} more waypoints
                </Text>
            </YStack>
        </Button>
    </XStack>
);

interface OrderWaypointsProps {
    order: any;
    onPress?: () => void;
    wrapperStyle?: any;
    containerStyle?: any;
    textStyle?: any;
}

const OrderWaypointList: React.FC<OrderWaypointsProps> = ({ order, onPress, wrapperStyle, containerStyle, textStyle }) => {
    const [isWaypointsCollapsed, setIsWaypointsCollapsed] = useState(true);

    // Helper functions to extract waypoint data
    const getFirstWaypoint = (order) => {
        const payload = order.getAttribute('payload');
        if (!payload) return null;
        if (payload.pickup) return payload.pickup;
        const first = payload.waypoints[0] ?? payload.dropoff;
        if (first) {
            first.completed = first.status_code === 'COMPLETED';
        }
        return first;
    };

    const getLastWaypoint = (order) => {
        const payload = order.getAttribute('payload');
        if (!payload) return null;
        if (payload.dropoff) return payload.dropoff;
        const last = payload.waypoints[payload.waypoints.length - 1] ?? null;
        if (last) {
            last.completed = last.status_code === 'COMPLETED';
        }
        return last;
    };

    const getMiddleWaypoints = (order) => {
        const payload = order.getAttribute('payload');
        if (!payload) return [];
        const { waypoints, pickup, dropoff } = payload;
        if (!pickup && !dropoff && waypoints.length) {
            const middle = waypoints.slice(1, waypoints.length - 1);
            middle.forEach((wp) => {
                wp.completed = wp.status_code === 'COMPLETED';
            });
            return middle;
        }
        return waypoints || [];
    };

    const startCall = (phone: string) => {
        if (phone) {
            Linking.openURL(`tel:${phone}`);
        }
    };

    const toggleWaypointCollapse = () => {
        setIsWaypointsCollapsed((prev) => !prev);
    };

    const firstWaypoint = getFirstWaypoint(order);
    const lastWaypoint = getLastWaypoint(order);
    const middleWaypoints = getMiddleWaypoints(order);
    const payload = order.getAttribute('payload');

    return (
        <YStack overflow='hidden' {...wrapperStyle}>
            <YStack width='100%' {...containerStyle} onPress={onPress}>
                <YStack position='relative' zIndex={20}>
                    <YStack position='absolute' left={CIRCLE_SIZE / 2} top={CIRCLE_SIZE / 2} bottom={CIRCLE_SIZE / 2} borderLeftWidth={2} borderColor='$secondary' opacity={0.75} />
                    {payload && (
                        <YStack>
                            {firstWaypoint && <WaypointItem index={1} waypoint={firstWaypoint} textStyle={textStyle} onCall={startCall} />}

                            {isArray(middleWaypoints) &&
                                middleWaypoints.length < COLLAPSE_POINT &&
                                middleWaypoints.map((wp, i) => <WaypointItem key={i} index={i + 2} waypoint={wp} textStyle={textStyle} onCall={startCall} />)}

                            {isArray(middleWaypoints) && middleWaypoints.length >= COLLAPSE_POINT && (
                                <YStack>
                                    <WaypointCollapseButton isCollapsed={isWaypointsCollapsed} toggleCollapse={toggleWaypointCollapse} count={middleWaypoints.length} textStyle={textStyle} />
                                    <Collapsible collapsed={isWaypointsCollapsed}>
                                        {middleWaypoints.map((wp, i) => (
                                            <WaypointItem key={i} index={i + 2} waypoint={wp} textStyle={textStyle} onCall={startCall} />
                                        ))}
                                    </Collapsible>
                                </YStack>
                            )}

                            {lastWaypoint && (
                                <WaypointItem index={isArray(middleWaypoints) ? middleWaypoints.length + 2 : 2} waypoint={lastWaypoint} textStyle={textStyle} onCall={startCall} isLast />
                            )}
                        </YStack>
                    )}
                </YStack>
            </YStack>
        </YStack>
    );
};

export default OrderWaypointList;
