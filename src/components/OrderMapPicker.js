import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import React, { createRef } from 'react';
import { Dimensions, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ActionSheet from 'react-native-actions-sheet';
import LaunchNavigator from 'react-native-launch-navigator';
import tailwind from 'tailwind';
import { deepGet, getColorCode, translate } from 'utils';

const windowHeight = Dimensions.get('window').height;
const dialogHeight = windowHeight / 2;

const OrderMapPicker = ({ title, wrapperStyle, order, buttonStyle }) => {
    const actionSheetRef = createRef();
    const payload = order.getAttribute('payload');
    const start = deepGet(payload.pickup, 'location.coordinates', []);
    const destination = deepGet(payload.dropoff, 'location.coordinates', []);

    title = title ?? translate('components.interface.OrderMapPicker.title');
    console.log('title', title);

    const s = [...start.reverse()];
    const d = [...destination.reverse()];

    const mapProviders = [
        { id: 1, label: 'Google Maps' },
        { id: 2, label: 'Apple Maps' },
        { id: 3, label: 'Waze' },
    ];

    const handleNavigate = async location => {
        if (location.label === 'Google Maps') {
            LaunchNavigator.navigate(d, {
                launchMode: LaunchNavigator.LAUNCH_MODE.TURN_BY_TURN,
                app: LaunchNavigator.APP.GOOGLE_MAPS,
                start: s,
            });
        } else if (location.label === 'Apple Maps') {
            LaunchNavigator.navigate(d, {
                launchMode: LaunchNavigator.LAUNCH_MODE.TURN_BY_TURN,
                app: LaunchNavigator.APP.APPLE_MAPS,
                start: s,
            });
        } else if (location.label === 'Waze') {
            LaunchNavigator.navigate(d, {
                launchMode: LaunchNavigator.LAUNCH_MODE.TURN_BY_TURN,
                app: LaunchNavigator.APP.WAZE,
                start: s,
            });
        }
    };

    return (
        <View style={[wrapperStyle]}>
            <TouchableOpacity style={tailwind('flex flex-row items-center px-4 pb-2 mt-1')} onPress={() => actionSheetRef.current?.setModalVisible()}>
                <View style={tailwind('btn bg-green-900 border border-green-700')}>
                    <Text style={tailwind('font-semibold text-red-50 text-base')}>Map</Text>
                </View>
            </TouchableOpacity>

            <ActionSheet
                containerStyle={[{ height: dialogHeight }]}
                gestureEnabled={true}
                bounceOnOpen={true}
                nestedScrollEnabled={true}
                onMomentumScrollEnd={() => actionSheetRef.current?.handleChildScrollEnd()}
                ref={actionSheetRef}
                containerStyle={tailwind('bg-gray-800')}
                indicatorColor={getColorCode('text-gray-900')}>
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
                        {mapProviders.map(location => (
                            <TouchableOpacity
                                key={location.id}
                                onPress={() => {
                                    handleNavigate(location);
                                }}>
                                <View style={tailwind('flex flex-row items-center px-5 py-4 border-b border-gray-900')}>
                                    <Text style={tailwind('font-semibold text-lg text-gray-100')}>{location.label}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                        <View style={tailwind('w-full h-40')}></View>
                    </ScrollView>
                </View>
            </ActionSheet>
        </View>
    );
};

export default OrderMapPicker;
