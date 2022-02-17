import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { tailwind } from 'tailwind';
import { format } from 'date-fns';
import { isEmpty, getDistance } from 'utils';
import Collapsible from 'react-native-collapsible';

const OrderWaypoints = ({ order, onPress, wrapperStyle, containerStyle }) => {
    const [isWaypointsCollapsed, setIsWaypointsCollapsed] = useState(false);

    const getCurrentLeg = (order) => {
        const payload = order.getAttribute('payload');
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

        if (payload?.pickup) {
            return payload.pickup;
        }

        const firstWaypoint = payload.waypoints[0] || null;

        if (firstWaypoint) {
            firstWaypoint.completed = firstWaypoint.status_code === 'COMPLETED';
        }

        return firstWaypoint;
    };

    const getLastWaypoint = (order) => {
        const payload = order.getAttribute('payload');

        if (payload?.dropoff) {
            return payload.dropoff;
        }

        const lastWaypoint = payload.waypoints[payload.waypoints.length - 1] || null;

        if (lastWaypoint) {
            lastWaypoint.completed = lastWaypoint.status_code === 'COMPLETED';
        }

        return lastWaypoint;
    };

    const getMiddleWaypoints = (order) => {
        const payload = order.getAttribute('payload');
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

    const currentLeg = getCurrentLeg(order);
    const firstWaypoint = getFirstWaypoint(order);
    const lastWaypoint = getLastWaypoint(order);
    const middleWaypoints = getMiddleWaypoints(order);
    const payload = order.getAttribute('payload');

    return (
        <View style={[tailwind(''), wrapperStyle]}>
            <View style={[tailwind('w-full'), containerStyle]} onPress={onPress}>
                <View style={tailwind('z-20 relative')}>
                    <View style={tailwind(`ml-4 absolute border-l-2 border-white opacity-75 h-full`)} />
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
                                        <Text style={tailwind(`text-xs text-gray-50 ${firstWaypoint.completed ? 'line-through' : ''}`)}>{firstWaypoint.address}</Text>
                                        {firstWaypoint.phone && (
                                            <TouchableOpacity onPress={() => startCall(firstWaypoint.phone)}>
                                                <Text style={tailwind('text-xs text-gray-50')}>{firstWaypoint.phone}</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            )}
                            {middleWaypoints &&
                                middleWaypoints.length < 5 &&
                                middleWaypoints.map((waypoint, i) => (
                                    <View key={i} style={tailwind('w-full flex-row items-start mb-4')}>
                                        <View style={tailwind('mr-3')}>
                                            <View style={tailwind('rounded-full bg-green-500 w-8 h-8 flex items-center justify-center')}>
                                                <Text style={tailwind('font-bold text-white')}>{i + 2}</Text>
                                            </View>
                                        </View>
                                        <View style={tailwind('w-full')}>
                                            <Text style={tailwind(`text-xs text-gray-50 ${waypoint.completed ? 'line-through' : ''}`)}>{waypoint.address}</Text>
                                            {waypoint.phone && (
                                                <TouchableOpacity onPress={() => startCall(waypoint.phone)}>
                                                    <Text style={tailwind('text-xs text-gray-50')}>{waypoint.phone}</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                ))}
                            {middleWaypoints && middleWaypoints.length > 5 && (
                                <View>
                                    <View style={tailwind('w-full flex-row items-start mb-4')}>
                                        <TouchableOpacity style={tailwind('w-full')} onPress={this.toggleWaypointCollapse}>
                                            <View style={tailwind('px-3 py-2 w-full bg-yellow-500 text-yellow-900 rounded shadow-sm flex')}>
                                                <View style={tailwind('flex flex-row')}>
                                                    <FontAwesomeIcon icon={faEye} style={tailwind('mr-2')} />
                                                    <Text style={tailwind('font-bold')}>{isWaypointsCollapsed ? 'Tap to expand' : 'Tap to collapse'}</Text>
                                                </View>
                                                <Text>{middleWaypoints.length + 1} more waypoints</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                    <Collapsible collapsed={isWaypointsCollapsed}>
                                        {middleWaypoints.map((waypoint, i) => (
                                            <View key={i} style={tailwind('w-full flex-row items-start mb-4')}>
                                                <View style={tailwind('mr-3')}>
                                                    <View style={tailwind('rounded-full bg-green-500 w-8 h-8 flex items-center justify-center')}>
                                                        <Text style={tailwind('font-bold text-white')}>{i + 2}</Text>
                                                    </View>
                                                </View>
                                                <View style={tailwind('w-full')}>
                                                    <Text style={tailwind(`text-xs text-gray-50 ${waypoint.completed ? 'line-through' : ''}`)}>{waypoint.address}</Text>
                                                    {waypoint.phone && (
                                                        <TouchableOpacity onPress={() => startCall(waypoint.phone)}>
                                                            <Text style={tailwind('text-xs text-gray-50')}>{waypoint.phone}</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            </View>
                                        ))}
                                    </Collapsible>
                                </View>
                            )}
                            {lastWaypoint && (
                                <View style={tailwind('w-full flex-row items-start')}>
                                    <View style={tailwind('mr-3')}>
                                        <View style={tailwind('rounded-full bg-red-500 w-8 h-8 flex items-center justify-center')}>
                                            <Text style={tailwind('font-bold text-white')}>{middleWaypoints.length + 2}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('w-full')}>
                                        <Text style={tailwind(`text-xs text-gray-50 ${lastWaypoint.completed ? 'line-through' : ''}`)}>{lastWaypoint.address}</Text>
                                        {lastWaypoint.phone && (
                                            <TouchableOpacity onPress={() => startCall(lastWaypoint.phone)}>
                                                <Text style={tailwind('text-xs text-gray-50')}>{lastWaypoint.phone}</Text>
                                            </TouchableOpacity>
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
