import React, { useState, useEffect, createRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, TextInput, ActivityIndicator, Dimensions, Modal, Platform } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faTimes, faTimesCircle, faSort, faFilter, faMapMarked, faCalendarDay } from '@fortawesome/free-solid-svg-icons';
import { format } from 'date-fns';
import { translate, capitalize, getColorCode } from 'utils';
import { useMountedState } from 'hooks';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import ActionSheet from 'react-native-actions-sheet';
import tailwind from 'tailwind';

const isAndroid = Platform.OS === 'android';
const windowHeight = Dimensions.get('window').height;
const dialogHeight = windowHeight / 2;
const isObjectEmpty = (obj) => Object.values(obj).length === 0;

const OrdersFilterBar = ({ onSelectSort, onSelectFilter, onSelectDate, onSelectType, onSelectStatus, wrapperStyle, containerStyle, scrollContainerStyle, isLoading }) => {
    const actionSheetRef = createRef();

    const [currentAction, setCurrentAction] = useState('sort');
    const [sort, setSortValue] = useState(null);
    const [filter, setFilterValue] = useState({});
    const [date, setDateValue] = useState(new Date());
    const [type, setTypeValue] = useState(null);
    const [status, setStatusValue] = useState(null);

    const callbacks = {
        onSelectSort,
        onSelectFilter,
        onSelectDate,
        onSelectType,
        onSelectStatus,
    };

    const setters = {
        setSortValue,
        setFilterValue,
        setDateValue,
        setTypeValue,
        setStatusValue,
    };

    const sortOptions = [
        { label: 'Newest first', value: '-created_at' },
        { label: 'Oldest first', value: 'created_at' },
        { label: 'Default', value: null },
    ];

    const filterOptions = [{ label: 'Status', options: ['created', 'driver_enroute', 'canceled', 'completed'], param: 'status' }];

    const openDialog = (action = 'sort') => {
        setCurrentAction(action);
        actionSheetRef.current?.setModalVisible();
    };

    const closeDialog = () => {
        actionSheetRef.current?.setModalVisible(false);
    };

    const openAndroidDatePicker = () => {
        DateTimePickerAndroid.open({
            value: date,
            mode: 'date',
            display: 'default',
            themeVariant: 'dark',
            onChange: (event, selectedDate) => setValue(selectedDate, 'date'),
            textColor: getColorCode('text-gray-50'),
            style: tailwind('w-20'),
        });
    };

    const setValue = (value, key = null) => {
        key = key ?? currentAction;

        const setter = `set${capitalize(key)}Value`;
        const callback = `onSelect${capitalize(key)}`;

        if (typeof setters[setter] === 'function') {
            setters[setter](value);
        }

        if (typeof callbacks[callback] === 'function') {
            callbacks[callback](value);
        }

        actionSheetRef.current?.setModalVisible(false);
    };

    return (
        <View style={[tailwind(''), wrapperStyle]}>
            <ScrollView horizontal={true} style={[tailwind('border-b border-gray-800'), scrollContainerStyle]}>
                <View style={[tailwind('py-2 px-4 h-14 flex flex-row items-center'), containerStyle]}>
                    {isLoading && <ActivityIndicator style={tailwind('mr-2')} tintColor={getColorCode('text-blue-200')} />}
                    <View style={tailwind('shadow rounded-md mr-2')}>
                        {isAndroid ? (
                            <TouchableOpacity onPress={openAndroidDatePicker}>
                                <View style={tailwind('bg-gray-700 rounded-md py-2 px-3')}>
                                    <Text style={tailwind('text-gray-50')}>{format(date, 'MM/dd/yy')}</Text>
                                </View>
                            </TouchableOpacity>
                        ) : (
                            <DateTimePicker
                                value={date}
                                mode={'date'}
                                display={'default'}
                                themeVariant={'dark'}
                                onChange={(event, selectedDate) => setValue(selectedDate, 'date')}
                                textColor={getColorCode('text-gray-50')}
                                style={tailwind('w-20')}
                            />
                        )}
                    </View>
                    <View style={tailwind('pr-2')}>
                        <TouchableOpacity
                            onPress={() => openDialog('sort')}
                            style={[tailwind(`btn bg-gray-800 border ${sort ? 'border-blue-500' : 'border-gray-700'} rounded-full px-4 py-2`), { width: 'auto' }]}
                        >
                            <View style={tailwind('flex flex-row items-center')}>
                                <FontAwesomeIcon icon={faSort} size={12} style={tailwind(`${sort ? 'text-blue-500' : 'text-gray-300'} mr-1`)} />
                                <Text style={tailwind(`${sort ? 'text-blue-500' : 'text-gray-300'} font-semibold`)}>{translate('terms.sort')}</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                    <View style={tailwind('pr-2')}>
                        <TouchableOpacity
                            onPress={() => openDialog('filter')}
                            style={[tailwind(`btn bg-gray-800 border ${!isObjectEmpty(filter) ? 'border-blue-500' : 'border-gray-700'} rounded-full px-4 py-2`), { width: 'auto' }]}
                        >
                            <View style={tailwind('flex flex-row items-center')}>
                                <FontAwesomeIcon icon={faFilter} size={10} style={tailwind('text-gray-300 mr-1')} />
                                <Text style={tailwind(`${!isObjectEmpty(filter) ? 'text-blue-500' : 'text-gray-300'} font-semibold`)}>{translate('terms.filter')}</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
            <ActionSheet
                ref={actionSheetRef}
                containerStyle={{ height: windowHeight / 2, backgroundColor: getColorCode('bg-gray-800') }}
                parentContainer={[tailwind('bg-gray-800')]}
                indicatorColor={getColorCode('bg-gray-900')}
                overlayColor={getColorCode('bg-gray-900')}
                gestureEnabled={true}
                bounceOnOpen={true}
                closeOnTouchBackdrop={false}
                nestedScrollEnabled={true}
                statusBarTranslucent={true}
                defaultOverlayOpacity={0.7}
                onMomentumScrollEnd={() => actionSheetRef.current?.handleChildScrollEnd()}
            >
                <View>
                    <View style={tailwind('px-5 py-2 flex flex-row items-center justify-between mb-2')}>
                        <View style={tailwind('flex flex-row items-center')}>
                            <Text style={tailwind('text-lg font-semibold text-gray-50')}>{capitalize(currentAction)}</Text>
                        </View>

                        <View>
                            <TouchableOpacity onPress={() => actionSheetRef.current?.hide()}>
                                <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                                    <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <ScrollView showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
                        <View style={tailwind('w-full')}>
                            {currentAction === 'sort' && (
                                <View style={tailwind('px-5')}>
                                    {sortOptions.map((sortOption, index) => (
                                        <TouchableOpacity key={index} style={tailwind('mb-4')} onPress={() => setValue(sortOption.value, 'sort')}>
                                            <View key={index} style={tailwind('btn bg-gray-900 border border-gray-700 rounded-lg shadow-sm justify-start px-4')}>
                                                <Text style={tailwind('text-gray-50 text-lg')}>{sortOption.label}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>
                    </ScrollView>
                </View>
            </ActionSheet>
        </View>
    );
};

export default OrdersFilterBar;
