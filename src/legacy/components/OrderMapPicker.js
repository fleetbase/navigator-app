import { faLocationArrow, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import React, { createRef, useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ActionSheet from 'react-native-actions-sheet';
import LaunchNavigator from 'react-native-launch-navigator';
import tailwind from 'tailwind';
import { deepGet, getColorCode, isEmpty, translate } from 'utils';

function waypointMustHaveId(waypoint) {
    return typeof waypoint?.id === 'string' && waypoint.id.startsWith('place_');
}

function getOrderDestination(order) {
    const waypoints = [order.getAttribute('payload.pickup'), ...order.getAttribute('payload.waypoints', []), order.getAttribute('payload.dropoff')].filter(waypointMustHaveId);
    const orderHasWaypoints = !isEmpty(order.getAttribute('payload.waypoints', []));

    let destination = order.getAttribute('payload.pickup');

    if (order.isEnroute) {
        destination = order.getAttribute('payload.dropoff');
    }

    if (orderHasWaypoints) {
        destination = waypoints.find((waypoint) => {
            return typeof waypoint.id === 'string' && waypoint.id === order.getAttribute('payload.current_waypoint');
        });

        if (!destination) {
            return waypoints[0];
        }
    }

    return destination;
}

const OrderMapPicker = ({ title = 'Select Navigator', wrapperStyle, order, buttonStyle }) => {
    const actionSheetRef = createRef();
    const destinationWaypoint = getOrderDestination(order);
    const destination = [...deepGet(destinationWaypoint, 'location.coordinates', [])].reverse();
    const [mapProviders, setMapProviders] = useState([]);

    title = title ?? translate('components.interface.OrderMapPicker.title');

    useEffect(() => {
        LaunchNavigator.getAvailableApps().then(setMapProviders);
    }, []);

    const handleNavigate = async (app) => {
        LaunchNavigator.navigate(destination, {
            launchMode: LaunchNavigator.LAUNCH_MODE.TURN_BY_TURN,
            app,
        });
    };

    return (
        <View style={[wrapperStyle]}>
            <TouchableOpacity style={tailwind('flex flex-row items-center px-4 pb-2 mt-1')} onPress={() => actionSheetRef.current?.setModalVisible()}>
                <View style={tailwind('btn bg-blue-900 border border-blue-700 py-0 pl-4 pr-2')}>
                    <View style={tailwind('flex flex-row justify-start')}>
                        <View style={tailwind('border-r border-blue-700 py-2 pr-4 flex flex-row items-center')}>
                            <FontAwesomeIcon icon={faLocationArrow} style={tailwind('text-blue-50 mr-2')} />
                            <Text style={tailwind('font-semibold text-blue-50 text-base')}>Navigate</Text>
                        </View>
                        <View style={tailwind('flex-1 py-2 px-2 flex items-center')}>
                            <Text numberOfLines={1} style={tailwind('text-blue-50 text-base')}>
                                {destinationWaypoint.address}
                            </Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
            <ActionSheet
                gestureEnabled={true}
                bounceOnOpen={true}
                nestedScrollEnabled={true}
                onMomentumScrollEnd={() => actionSheetRef.current?.handleChildScrollEnd()}
                ref={actionSheetRef}
                containerStyle={tailwind('bg-gray-800')}
                indicatorColor={getColorCode('text-gray-900')}
            >
                <View>
                    <View style={tailwind('px-5 py-2 flex flex-row items-center justify-between mb-2')}>
                        <View style={tailwind('flex flex-row items-center')}>
                            <Text style={tailwind('text-lg text-white font-semibold')}>{title}</Text>
                        </View>
                        <View>
                            <TouchableOpacity onPress={() => actionSheetRef.current?.hide()}>
                                <View style={tailwind('rounded-full bg-red-700 w-8 h-8 flex items-center justify-center')}>
                                    <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-100')} />
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <ScrollView showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
                        {Object.keys(mapProviders).map((provider) =>
                            mapProviders[provider] ? (
                                <TouchableOpacity
                                    key={provider}
                                    onPress={() => {
                                        handleNavigate(provider);
                                    }}
                                >
                                    <View style={tailwind('flex flex-row items-center px-5 py-4 border-b border-gray-900')}>
                                        <Text style={tailwind('font-semibold text-lg text-gray-100')}>{LaunchNavigator.getAppDisplayName(provider)}</Text>
                                    </View>
                                </TouchableOpacity>
                            ) : null
                        )}
                        <View style={tailwind('w-full h-40')}></View>
                    </ScrollView>
                </View>
            </ActionSheet>
        </View>
    );
};

export default OrderMapPicker;
