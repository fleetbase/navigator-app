import { faAngleDown, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useNavigation } from '@react-navigation/native';
import React, { createRef } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ActionSheet from 'react-native-actions-sheet';
import tailwind from 'tailwind';

import { getColorCode } from 'utils';

const DropdownActionSheet = ({ items, onChange, title }) => {
    const actionSheetRef = createRef();
    const navigation = useNavigation();

    return (
        <View style={tailwind('mb-4')}>
            <TouchableOpacity style={tailwind('flex flex-row items-start px-4 pb-2 mt-1')} onPress={() => actionSheetRef.current?.setModalVisible()}>
                <View style={tailwind('btn bg-gray-900 py-0 pl-4 pr-2')}>
                    <View style={[tailwind('flex flex-col justify-between')]}>
                        <View style={tailwind('border-blue-700 py-2 pr-4 flex flex-row items-center')}>
                            <Text style={tailwind('font-semibold text-blue-50 text-base')}>{title}</Text>
                            <FontAwesomeIcon icon={faAngleDown} style={tailwind('text-white')} />
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
                        {items?.map(item => (
                            <TouchableOpacity
                                key={item.value}
                                onPress={() => {
                                    onChange(item.value, navigation.goBack());
                                }}>
                                <View style={tailwind('flex flex-row items-center px-5 py-4 border-b border-gray-900')}>
                                    <Text style={tailwind('font-semibold text-lg text-gray-100')}>{item.label}</Text>
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

export default DropdownActionSheet;
