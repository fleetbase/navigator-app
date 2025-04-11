import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions, Linking } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faEye } from '@fortawesome/free-solid-svg-icons';
import { tailwind } from 'tailwind';
import { format } from 'date-fns';
import { isArray, isEmpty, getDistance } from 'utils';
import OrderStatusBadge from 'components/OrderStatusBadge';
import Collapsible from 'react-native-collapsible';

const COLLAPSE_POINT = 2;

const OrderWaypoints = ({ order, onPress, wrapperStyle, containerStyle, textStyle }) => {
    const [isWaypointsCollapsed, setIsWaypointsCollapsed] = useState(true);

    const getCurrentLeg = (order) => {
        const payload = order.getAttribute('payload');

        if (!payload) {
            return false;
        }

        const { waypoints, current_waypoint } = payload;
        const isMultiDropOrder = !isEmpty(payload.waypoints);

        if (!isMultiDropOrder) {
            return false;
        }

        return waypoints.find((waypoint) => {
            return waypoint.id === current_waypoint;
        });
    };

    const getFirstWaypoint = (order) => {
        const payload = order.getAttribute('payload');

        if (!payload) {
            return false;
        }

        if (payload?.pickup) {
            return payload.pickup;
        }

        const firstWaypoint = payload.waypoints[0] ?? payload?.dropoff;

        if (firstWaypoint) {
            firstWaypoint.completed = firstWaypoint.status_code === 'COMPLETED';
        }

        return firstWaypoint;
    };

    const getLastWaypoint = (order) => {
        const payload = order.getAttribute('payload');

        if (!payload) {
            return false;
        }

        if (payload?.dropoff) {
            return payload.dropoff;
        }

        const lastWaypoint = payload.waypoints[payload.waypoints.length - 1] ?? null;

        if (lastWaypoint) {
            lastWaypoint.completed = lastWaypoint.status_code === 'COMPLETED';
        }

        return lastWaypoint;
    };

    const getMiddleWaypoints = (order) => {
        const payload = order.getAttribute('payload');

        if (!payload) {
            return false;
        }
        const { waypoints, pickup, dropoff } = payload;

        if (!pickup && !dropoff && waypoints.length) {
            const middleWaypoints = waypoints.slice(1, waypoints.length - 1);

            middleWaypoints.forEach((waypoint) => {
                waypoint.completed = waypoint.status_code === 'COMPLETED';
            });

            return middleWaypoints;
        }

        return waypoints || [];
    };

    const startCall = (phone) => {
        if (phone) {
            Linking.openURL(`tel:${phone}`);
        }
    };

    const toggleWaypointCollapse = () => {
        setIsWaypointsCollapsed(!isWaypointsCollapsed);
    };

    const currentLeg = getCurrentLeg(order);
    const firstWaypoint = getFirstWaypoint(order);
    const lastWaypoint = getLastWaypoint(order);
    const middleWaypoints = getMiddleWaypoints(order);
    const payload = order.getAttribute('payload');

    return (
        <View style={[tailwind('overflow-hidden'), wrapperStyle]}>
            <View style={[tailwind('w-full'), containerStyle]} onPress={onPress}>
                <View style={tailwind('z-20 relative')}>
                    <View style={[{ height: '100%' }, tailwind(`ml-4 absolute border-l-2 border-white opacity-75`)]} />
                    {payload && (
                        <View style={tailwind('')}>
                            {firstWaypoint && (
                                <View style={tailwind('w-full flex-row items-start mb-4')}>
                                    <View style={tailwind('mr-3')}>
                                        <View style={tailwind('rounded-full bg-blue-500 w-8 h-8 flex items-center justify-center')}>
                                            <Text style={tailwind('font-bold text-white')}>1</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('w-4/5')}>
                                        <Text style={[tailwind(`text-xs text-gray-50 ${firstWaypoint.completed ? 'line-through' : ''}`), textStyle]}>{firstWaypoint.address}</Text>
                                        {firstWaypoint.phone && (
                                            <TouchableOpacity onPress={() => startCall(firstWaypoint.phone)}>
                                                <Text style={[tailwind('text-xs text-gray-50'), textStyle]}>{firstWaypoint.phone}</Text>
                                            </TouchableOpacity>
                                        )}
                                        {firstWaypoint.tracking_number && (
                                            <View style={tailwind('mt-1 flex flex-row')}>
                                                <OrderStatusBadge
                                                    status={firstWaypoint.tracking_number.status_code}
                                                    wrapperStyle={[tailwind('flex-grow-0')]}
                                                    style={[tailwind('px-2 py-0.5')]}
                                                    textStyle={[tailwind('text-xs')]}
                                                />
                                            </View>
                                        )}
                                    </View>
                                </View>
                            )}
                            {isArray(middleWaypoints) &&
                                middleWaypoints &&
                                middleWaypoints.length < COLLAPSE_POINT &&
                                middleWaypoints.map((waypoint, i) => (
                                    <View key={i} style={tailwind('w-full flex-row items-start mb-4')}>
                                        <View style={tailwind('mr-3')}>
                                            <View style={tailwind('rounded-full bg-green-500 w-8 h-8 flex items-center justify-center')}>
                                                <Text style={[tailwind('font-bold text-white')]}>{i + 2}</Text>
                                            </View>
                                        </View>
                                        <View style={tailwind('w-full')}>
                                            <Text style={[tailwind(`text-xs text-gray-50 ${waypoint.completed ? 'line-through' : ''}`), textStyle]}>{waypoint.address}</Text>
                                            {waypoint.phone && (
                                                <TouchableOpacity onPress={() => startCall(waypoint.phone)}>
                                                    <Text style={[tailwind('text-xs text-gray-50'), textStyle]}>{waypoint.phone}</Text>
                                                </TouchableOpacity>
                                            )}
                                            {waypoint.tracking_number && (
                                                <View style={tailwind('mt-1 flex flex-row')}>
                                                    <OrderStatusBadge
                                                        status={waypoint.tracking_number.status_code}
                                                        wrapperStyle={[tailwind('flex-grow-0')]}
                                                        style={[tailwind('px-2 py-0.5')]}
                                                        textStyle={[tailwind('text-xs')]}
                                                    />
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                ))}
                            {isArray(middleWaypoints) && middleWaypoints && middleWaypoints.length >= COLLAPSE_POINT && (
                                <View>
                                    <View style={tailwind('w-full flex-row items-start mb-4')}>
                                        <TouchableOpacity style={tailwind('w-full')} onPress={toggleWaypointCollapse}>
                                            <View style={tailwind('px-3 py-2 w-full bg-yellow-400 border border-yellow-500 rounded shadow-sm flex')}>
                                                <View style={tailwind('flex flex-row')}>
                                                    <FontAwesomeIcon icon={faEye} style={tailwind('mr-2 text-yellow-900')} />
                                                    <Text style={[tailwind('font-bold text-yellow-900'), textStyle]}>{isWaypointsCollapsed ? 'Tap to expand' : 'Tap to collapse'}</Text>
                                                </View>
                                                <Text style={[tailwind('text-yellow-900'), textStyle]}>{middleWaypoints.length} more waypoints</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                    <Collapsible collapsed={isWaypointsCollapsed}>
                                        {isArray(middleWaypoints) &&
                                            middleWaypoints.map((waypoint, i) => (
                                                <View key={i} style={tailwind('w-full flex-row items-start mb-4')}>
                                                    <View style={tailwind('mr-3')}>
                                                        <View style={tailwind('rounded-full bg-green-500 w-8 h-8 flex items-center justify-center')}>
                                                            <Text style={tailwind('font-bold text-white')}>{i + 2}</Text>
                                                        </View>
                                                    </View>
                                                    <View style={tailwind('w-full')}>
                                                        <Text style={[tailwind(`text-xs text-gray-50 ${waypoint.completed ? 'line-through' : ''}`), textStyle]}>{waypoint.address}</Text>
                                                        {waypoint.phone && (
                                                            <TouchableOpacity onPress={() => startCall(waypoint.phone)}>
                                                                <Text style={[tailwind('text-xs text-gray-50'), textStyle]}>{waypoint.phone}</Text>
                                                            </TouchableOpacity>
                                                        )}
                                                        {waypoint.tracking_number && (
                                                            <View style={tailwind('mt-1 flex flex-row')}>
                                                                <OrderStatusBadge
                                                                    status={waypoint.tracking_number.status_code}
                                                                    wrapperStyle={[tailwind('flex-grow-0')]}
                                                                    style={[tailwind('px-2 py-0.5')]}
                                                                    textStyle={[tailwind('text-xs')]}
                                                                />
                                                            </View>
                                                        )}
                                                    </View>
                                                </View>
                                            ))}
                                    </Collapsible>
                                </View>
                            )}
                            {lastWaypoint && (
                                <View style={tailwind('w-full flex-row items-end')}>
                                    <View style={tailwind('mr-3')}>
                                        <View style={tailwind('rounded-full bg-red-500 w-8 h-8 flex items-center justify-center')}>
                                            <Text style={tailwind('font-bold text-white')}>{middleWaypoints.length + 2}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('w-full')}>
                                        <Text style={[tailwind(`text-xs text-gray-50 ${lastWaypoint.completed ? 'line-through' : ''}`), textStyle]}>{lastWaypoint.address}</Text>
                                        {lastWaypoint.phone && (
                                            <TouchableOpacity onPress={() => startCall(lastWaypoint.phone)}>
                                                <Text style={[tailwind('text-xs text-gray-50'), textStyle]}>{lastWaypoint.phone}</Text>
                                            </TouchableOpacity>
                                        )}
                                        {lastWaypoint.tracking_number && (
                                            <View style={[tailwind('mt-1 flex flex-row')]}>
                                                <OrderStatusBadge
                                                    status={lastWaypoint.tracking_number.status_code}
                                                    wrapperStyle={[tailwind('flex-grow-0')]}
                                                    style={[tailwind('px-2 py-0.5')]}
                                                    textStyle={[tailwind('text-xs')]}
                                                />
                                            </View>
                                        )}
                                    </View>
                                </View>
                            )}
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
};

export default OrderWaypoints;
