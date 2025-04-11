import React, { createRef, useState, useEffect } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ActionSheet from 'react-native-actions-sheet';
import { faAngleDown, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useNavigation } from '@react-navigation/native';
import tailwind from 'tailwind';

import { getColorCode } from 'utils';

const DropdownActionSheet = ({ items, onChange, title, value }) => {
    const actionSheetRef = createRef();
    const navigation = useNavigation();
    const [selectedItem, setSelectedItem] = useState(null);

    useEffect(() => {
        const selected = items.find((item) => item.value === value);
        if (selected) {
            setSelectedItem(selected);
        }
    }, [value]);

    const handleItemSelection = (item) => {
        setSelectedItem(item);
        onChange(item.value);
        actionSheetRef.current?.hide();
    };

    return (
        <View style={tailwind('mb-4')}>
            <TouchableOpacity onPress={() => actionSheetRef.current?.setModalVisible()}>
                <View style={tailwind('flex flex-row items-center justify-between pb-1  bg-gray-900 border border-gray-700 rounded-lg  px-2')}>
                    <View style={tailwind('border-blue-700 py-2 pr-4 flex flex-row items-center')}>
                        <Text style={[tailwind('font-semibold text-blue-50 text-base'), selectedItem && tailwind('px-2')]}>{selectedItem ? selectedItem.label : title}</Text>
                    </View>
                    <View style={tailwind('flex flex-row items-center')}>{<FontAwesomeIcon icon={faAngleDown} style={tailwind('text-white')} />}</View>
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
                            <Text style={tailwind('text-lg text-white font-semibold')}>{selectedItem ? selectedItem.label : title}</Text>
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
                        {items?.map((item) => (
                            <TouchableOpacity key={item.value} onPress={() => handleItemSelection(item)}>
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
