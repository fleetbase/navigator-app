import React from 'react';
import { Dimensions, Text, TouchableOpacity, View } from 'react-native';
import LaunchNavigator from 'react-native-launch-navigator';
import { tailwind } from 'tailwind';
import { deepGet, isEmpty } from 'utils';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.0922;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

const OrderRouteMap = ({ order }) => {
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

        const firstWaypoint = payload.waypoints[0] ?? payload?.dropoff;

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

        const lastWaypoint = payload.waypoints[payload.waypoints.length - 1] ?? null;

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

    const currentLeg = getCurrentLeg(order);
    const firstWaypoint = getFirstWaypoint(order);
    const lastWaypoint = getLastWaypoint(order);
    const middleWaypoints = getMiddleWaypoints(order) ?? [];
    const payload = order.getAttribute('payload');

    const start = deepGet(payload.pickup, 'location.coordinates', []);
    const destination = deepGet(payload.dropoff, 'location.coordinates', []);

    const s = [...start.reverse()];
    const d = [...destination.reverse()];

    const handleLaunchNavigator = async () => {
        LaunchNavigator.isAppAvailable(LaunchNavigator.APP.GOOGLE_MAPS).then((isGoogleMapAvailable) => {
            if (isGoogleMapAvailable) {
                app = LaunchNavigator.APP.GOOGLE_MAPS;
            } else {
                app = LaunchNavigator.APP.APPLE_MAPS || LaunchNavigator.APP.WAZE;
            }

            LaunchNavigator.navigate(d, {
                launchMode: LaunchNavigator.LAUNCH_MODE.TURN_BY_TURN,
                app: app,
                start: s,
            })

                .then(() => console.log('Launched navigator'))
                .catch((err) => console.warn('Error launching navigator: ' + err));
        });
    };

    return (
        <TouchableOpacity style={tailwind('flex flex-row items-center px-4 pb-2 mt-1')} onPress={() => handleLaunchNavigator()}>
            <View style={tailwind('btn bg-green-900 border border-green-700')}>
                <Text style={tailwind('font-semibold text-red-50 text-base')}>Map</Text>
            </View>
        </TouchableOpacity>
    );
};

export default OrderRouteMap;
