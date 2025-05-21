import React, { useState } from 'react';
import { Linking } from 'react-native';
import { XStack, YStack, Text, Button, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faEye } from '@fortawesome/free-solid-svg-icons';
import Collapsible from 'react-native-collapsible';
import Badge from './Badge';
import { isArray, isEmpty } from '../utils';
import { lowercase } from '../utils/format';

export const COLLAPSE_POINT = 2;
export const CIRCLE_SIZE = 32;

interface WaypointCircleProps {
    number: number;
    backgroundColor: string;
}
export const WaypointCircle: React.FC<WaypointCircleProps> = ({
    icon,
    iconColor,
    iconSize,
    number,
    backgroundColor,
    fontColor = '$successText',
    circleSize = CIRCLE_SIZE,
    mr = '$3',
    ...props
}) => (
    <YStack mr={mr}>
        <YStack borderRadius={circleSize} backgroundColor={backgroundColor} width={circleSize} height={circleSize} alignItems='center' justifyContent='center' {...props}>
            {icon ? (
                <FontAwesomeIcon icon={icon} color={iconColor} size={iconSize} />
            ) : (
                <Text fontWeight='bold' color={fontColor}>
                    {number}
                </Text>
            )}
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
export const WaypointItem: React.FC<WaypointItemProps> = ({
    index,
    waypoint,
    title,
    textStyle,
    titleStyle,
    onCall,
    icon,
    iconColor,
    iconSize,
    isLast = false,
    circleBackgroundColor = '$success',
    circleBorderColor = '$successBorder',
    circleFontColor = '$successText',
    children,
}) => (
    <XStack alignItems='center' mb={isLast ? 0 : '$4'} width='100%'>
        <WaypointCircle
            number={index}
            icon={icon}
            iconSize={iconSize}
            iconColor={iconColor}
            backgroundColor={circleBackgroundColor}
            borderWidth={1}
            borderColor={circleBorderColor}
            fontColor={circleFontColor}
        />
        <YStack flex={1}>
            {title && (
                <Text fontSize='$2' color='$textPrimary' {...titleStyle}>
                    {title}
                </Text>
            )}
            <Text fontSize='$2' color={title ? '$textSecondary' : '$textPrimary'} textDecorationLine={waypoint.complete ? 'line-through' : 'none'} {...textStyle}>
                {waypoint.address}
            </Text>
            {waypoint.phone && (
                <Button onPress={() => onCall(waypoint.phone)} backgroundColor='transparent' padding={0}>
                    <Text fontSize='$2' color='gray' {...textStyle}>
                        {waypoint.phone}
                    </Text>
                </Button>
            )}
            {typeof children === 'function' && children({ waypoint, index })}
        </YStack>
    </XStack>
);

interface WaypointCollapseButtonProps {
    isCollapsed: boolean;
    toggleCollapse: () => void;
    count: number;
    textStyle?: any;
}
const WaypointCollapseButton: React.FC<WaypointCollapseButtonProps> = ({ isCollapsed, toggleCollapse, count, textStyle }) => {
    const theme = useTheme();

    return (
        <XStack alignItems='center' mb='$4' width='100%'>
            <Button onPress={toggleCollapse} width='100%' backgroundColor='transparent' padding={0}>
                <YStack paddingHorizontal='$3' paddingVertical='$2' width='100%' backgroundColor='$warning' borderWidth={1} borderColor='$warningBorder' borderRadius='$2' elevation={1}>
                    <XStack alignItems='center'>
                        <FontAwesomeIcon icon={faEye} style={{ marginRight: 8, color: theme['$warningText'].val }} />
                        <Text fontWeight='bold' color='$warningText' {...textStyle}>
                            {isCollapsed ? 'Tap to expand' : 'Tap to collapse'}
                        </Text>
                    </XStack>
                    <Text color='$warningText' {...textStyle}>
                        {count} more waypoints
                    </Text>
                </YStack>
            </Button>
        </XStack>
    );
};

interface OrderWaypointsProps {
    order: any;
    onPress?: () => void;
    wrapperStyle?: any;
    containerStyle?: any;
    textStyle?: any;
}

const OrderWaypointList: React.FC<OrderWaypointsProps> = ({ order, onPress, wrapperStyle, containerStyle, textStyle, children }) => {
    const [isWaypointsCollapsed, setIsWaypointsCollapsed] = useState(true);

    // Helper functions to extract waypoint data
    const getFirstWaypoint = (order) => {
        const payload = order.getAttribute('payload');
        if (!payload) return null;
        if (payload.pickup) return payload.pickup;
        const first = { ...(payload.waypoints[0] ?? payload.dropoff) };
        if (first) {
            first.completed = first.status_code === 'COMPLETED';
        }
        return first;
    };

    const getLastWaypoint = (order) => {
        const payload = order.getAttribute('payload');
        if (!payload) return null;
        if (payload.dropoff) return payload.dropoff;
        const lastWaypoint = payload.waypoints[payload.waypoints.length - 1];
        const last = lastWaypoint ? { ...lastWaypoint } : null;
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
            middle.map((wp) => {
                return {
                    ...wp,
                    completed: wp.status_code === 'COMPLETED',
                };
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
                            {firstWaypoint && (
                                <WaypointItem index={1} waypoint={firstWaypoint} textStyle={textStyle} onCall={startCall}>
                                    {typeof children === 'function' && children()}
                                </WaypointItem>
                            )}

                            {isArray(middleWaypoints) &&
                                middleWaypoints.length < COLLAPSE_POINT &&
                                middleWaypoints.map((wp, i) => (
                                    <WaypointItem key={i} index={i + 2} waypoint={wp} textStyle={textStyle} onCall={startCall}>
                                        {typeof children === 'function' && children()}
                                    </WaypointItem>
                                ))}

                            {isArray(middleWaypoints) && middleWaypoints.length >= COLLAPSE_POINT && (
                                <YStack>
                                    <WaypointCollapseButton isCollapsed={isWaypointsCollapsed} toggleCollapse={toggleWaypointCollapse} count={middleWaypoints.length} textStyle={textStyle} />
                                    <Collapsible collapsed={isWaypointsCollapsed}>
                                        {middleWaypoints.map((wp, i) => (
                                            <WaypointItem key={i} index={i + 2} waypoint={wp} textStyle={textStyle} onCall={startCall}>
                                                {typeof children === 'function' && children()}
                                            </WaypointItem>
                                        ))}
                                    </Collapsible>
                                </YStack>
                            )}

                            {lastWaypoint && (
                                <WaypointItem index={isArray(middleWaypoints) ? middleWaypoints.length + 2 : 2} waypoint={lastWaypoint} textStyle={textStyle} onCall={startCall} isLast>
                                    {typeof children === 'function' && children()}
                                </WaypointItem>
                            )}
                        </YStack>
                    )}
                </YStack>
            </YStack>
        </YStack>
    );
};

export default OrderWaypointList;
