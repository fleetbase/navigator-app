import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faMapMarkerAlt } from '@fortawesome/free-solid-svg-icons';
import { tailwind } from 'tailwind';
import { format } from 'date-fns';
import { isEmpty, getDistance } from 'utils';
import MapView, { Marker } from 'react-native-maps';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.0922;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

const OrderRouteMap = ({ order, onPress, wrapperStyle, containerStyle, onMapReady }) => {

    const map = useRef();
    const isMultiDropOrder = !isEmpty(order.getAttribute('payload.waypoints', []));

    const getCurrentLeg = (order) => {
        const payload = order.getAttribute('payload');
        const { waypoints, current_waypoint } = payload;

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

        const firstWaypoint = payload.waypoints[0] ?? null;

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

        return waypoints ?? [];
    };

    const startCall = (phone) => {
        if (phone) {
            Linking.openURL(`tel:${phone}`);
        }
    };

    const currentLeg = getCurrentLeg(order);
    const firstWaypoint = getFirstWaypoint(order);
    const lastWaypoint = getLastWaypoint(order);
    const middleWaypoints = getMiddleWaypoints(order) ?? [];
    const payload = order.getAttribute('payload');

    const initialRegionCoordinates = {
        latitude: firstWaypoint.location.coordinates[1],
        longitude: firstWaypoint.location.coordinates[0]
    };

    return (
        <View style={[tailwind(''), wrapperStyle]}>
            <MapView
                ref={map}
                onMapReady={() => {
                    if (typeof onMapReady === 'function') {
                        onMapReady(map);
                    }
                }}
                minZoomLevel={12}
                maxZoomLevel={20}
                style={tailwind('w-full h-60 rounded-md shadow-sm')}
                initialRegion={{
                    ...initialRegionCoordinates,
                    latitudeDelta: 1.0922,
                    longitudeDelta: 0.0421,
                }}
            >
                {firstWaypoint && (
                    <Marker
                        coordinate={{
                            latitude: firstWaypoint.location.coordinates[1],
                            longitude: firstWaypoint.location.coordinates[0],
                        }}
                    >
                        <View style={tailwind('bg-blue-500 shadow-sm rounded-full w-8 h-8 flex items-center justify-center')}>
                            <Text style={tailwind('font-bold text-white')}>1</Text>
                        </View>
                    </Marker>
                )}

                {middleWaypoints.map((waypoint, i) => (
                    <Marker
                        key={i}
                        coordinate={{
                            latitude: waypoint.location.coordinates[1],
                            longitude: waypoint.location.coordinates[0],
                        }}
                    >
                        <View style={tailwind('bg-green-500 shadow-sm rounded-full w-8 h-8 flex items-center justify-center')}>
                            <Text style={tailwind('font-bold text-white')}>{i + 2}</Text>
                        </View>
                    </Marker>
                ))}

                {lastWaypoint && (
                    <Marker
                        coordinate={{
                            latitude: lastWaypoint.location.coordinates[1],
                            longitude: lastWaypoint.location.coordinates[0],
                        }}
                    >
                        <View style={tailwind('bg-red-500 shadow-sm rounded-full w-8 h-8 flex items-center justify-center')}>
                            <Text style={tailwind('font-bold text-white')}>{middleWaypoints.length + 2}</Text>
                        </View>
                    </Marker>
                )}
            </MapView>
        </View>
    );
};

export default OrderRouteMap;
