import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import React, { createRef, useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ActionSheet from 'react-native-actions-sheet';
import LaunchNavigator from 'react-native-launch-navigator';
import tailwind from 'tailwind';
import { deepGet, getColorCode, translate } from 'utils';

const OrderMapPicker = ({ title = 'Select Navigator', wrapperStyle, order, buttonStyle }) => {
    const actionSheetRef = createRef();
    const payload = order.getAttribute('payload');
    const start = deepGet(payload.pickup, 'location.coordinates', []);
    const destination = deepGet(payload.dropoff, 'location.coordinates', []);
    const [mapProviders, setMapProviders] = useState([]);

    title = title ?? translate('components.interface.OrderMapPicker.title');

    const s = [...start.reverse()];
    const d = [...destination.reverse()];

    useEffect(() => {
        LaunchNavigator.getAvailableApps().then(setMapProviders);
    }, []);

    const handleNavigate = async app => {
        LaunchNavigator.navigate(d, {
            launchMode: LaunchNavigator.LAUNCH_MODE.TURN_BY_TURN,
            app,
            start: s,
        });
    };

    return (
        <View style={[wrapperStyle]}>
            <TouchableOpacity style={tailwind('flex flex-row items-center px-4 pb-2 mt-1')} onPress={() => actionSheetRef.current?.setModalVisible()}>
                <View style={tailwind('btn bg-blue-900 border border-blue-700')}>
                    <Text style={tailwind('font-semibold text-red-50 text-base')}>Start Navigation</Text>
                </View>
            </TouchableOpacity>
            <ActionSheet
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
                        {Object.keys(mapProviders).map(provider =>
                            mapProviders[provider] ? (
                                <TouchableOpacity
                                    key={provider}
                                    onPress={() => {
                                        handleNavigate(provider);
                                    }}>
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