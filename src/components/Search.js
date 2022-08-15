import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollView, View, Text, Image, TouchableOpacity, TextInput, ActivityIndicator, Dimensions, Modal, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faSearch, faTimes } from '@fortawesome/free-solid-svg-icons';
import { logError, debounce, stripHtml, translate, getColorCode } from 'utils';
import { useFleetbase, useLocale, useMountedState, useStorage } from 'hooks';
import tailwind from 'tailwind';
import OrderCard from 'components/OrderCard';

const windowHeight = Dimensions.get('window').height;
const dialogHeight = windowHeight / 2;
const isAndroid = Platform.OS === 'android';

const Search = ({ network, wrapperStyle, buttonTitle, buttonStyle, buttonIcon, buttonIconStyle, onResultPress, placeholder }) => {
    buttonTitle = buttonTitle ?? `Search orders`;
    buttonIcon = buttonIcon ?? faSearch;

    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const fleetbase = useFleetbase();
    const isMounted = useMountedState();
    const searchInput = useRef();

    const [locale] = useLocale();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState([]);
    const [query, setQuery] = useState(null);

    const closeDialog = () => setIsDialogOpen(false);

    const handleResultPress = (result) => {
        if (typeof onResultPress === 'function') {
            onResultPress(result, closeDialog);
        }
    };

    const onModalShow = () => {
        setTimeout(() => {
            searchInput.current.focus();
        }, 100);
    };

    const fetchResults = useCallback(async (query, cb) => {
        setIsLoading(true);

        const results = await fleetbase.orders.query({ query }).catch(logError);

        setIsLoading(false);

        if (typeof cb === 'function') {
            cb(results);
        }
    });

    const debouncedSearch = debounce((query, cb) => {
        fetchResults(query, cb);
    }, 600);

    useEffect(() => {
        if (!query) {
            setResults([]);
        } else {
            debouncedSearch(query, setResults);
        }
    }, [query]);

    return (
        <View style={[wrapperStyle]}>
            <TouchableOpacity onPress={() => setIsDialogOpen(true)}>
                <View style={[tailwind(`flex flex-row items-center bg-gray-800 border border-gray-700 rounded-md px-3 pr-2 h-10`), buttonStyle]}>
                    <FontAwesomeIcon icon={buttonIcon} style={[tailwind('mr-2 text-gray-300'), buttonIconStyle]} />
                    <Text style={[tailwind('text-gray-300 text-base'), buttonStyle]}>{buttonTitle}</Text>
                </View>
            </TouchableOpacity>

            <Modal animationType={'slide'} transparent={true} visible={isDialogOpen} onRequestClose={closeDialog} onShow={onModalShow}>
                <View style={[tailwind('w-full h-full bg-gray-800'), { paddingTop: insets.top }]}>
                    <View style={tailwind('px-5 py-2 flex flex-row items-center justify-between')}>
                        <View style={tailwind('flex-1 pr-4')}>
                            <View style={tailwind('relative overflow-hidden')}>
                                <View style={tailwind('absolute top-0 bottom-0 left-0 h-full flex items-center justify-center z-10')}>
                                    <FontAwesomeIcon icon={buttonIcon} style={[tailwind('text-gray-700 ml-3'), buttonIconStyle]} />
                                </View>
                                <TextInput
                                    ref={searchInput}
                                    value={query}
                                    onChangeText={setQuery}
                                    autoComplete={'off'}
                                    autoCorrect={false}
                                    autoCapitalize={'none'}
                                    autoFocus={isAndroid ? false : true}
                                    clearButtonMode={'while-editing'}
                                    textAlign={'left'}
                                    style={tailwind('bg-gray-900 text-white rounded-md pl-10 shadow-lg pr-2 h-10')}
                                    placeholder={buttonTitle}
                                    placeholderTextColor={getColorCode('text-gray-700')}
                                />
                            </View>
                        </View>

                        <View>
                            <TouchableOpacity onPress={closeDialog}>
                                <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                                    <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                    {isLoading && (
                        <View style={tailwind('w-full px-5 py-4 flex flex-row items-center')}>
                            <ActivityIndicator />
                            <Text style={tailwind('ml-2 text-gray-400')}>{translate('components.interface.NetworkSearch.searching')}</Text>
                        </View>
                    )}
                    <ScrollView showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
                        {results.map((order, index) => (
                            <OrderCard
                                key={index}
                                order={order}
                                onPress={() => handleResultPress(order)}
                                containerStyle={tailwind('bg-transparent border-0')}
                                wrapperStyle={tailwind('border-b border-gray-900')}
                                headerStyle={tailwind('border-0')}
                                waypointsContainerStyle={tailwind('px-4 py-1')}
                            />
                        ))}
                        <View style={tailwind('w-full h-40')}></View>
                    </ScrollView>
                </View>
            </Modal>
        </View>
    );
};

export default Search;
