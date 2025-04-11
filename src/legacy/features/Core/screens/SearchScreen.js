import { faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import OrderCard from 'components/OrderCard';
import { searchButtonStyle } from 'components/SearchButton';
import { useDriver, useFleetbase, useLocale, useMountedState } from 'hooks';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, TextInput, View } from 'react-native';
import tailwind from 'tailwind';
import { debounce, getColorCode, isEmpty, logError, translate } from 'utils';

const isAndroid = Platform.OS === 'android';

const SearchScreen = ({ navigation }) => {
    const fleetbase = useFleetbase();
    const isMounted = useMountedState();
    const searchInput = useRef();
    const [driver] = useDriver();
    const [locale] = useLocale();

    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState([]);
    const [query, setQuery] = useState(null);

    const onOrderPress = useCallback((order) => {
        navigation.push('OrderScreen', { data: order.serialize() });
    });

    const fetchResults = useCallback(async (query, cb) => {
        setIsLoading(true);

        const results = await fleetbase.orders.query({ query, driver: driver.id }).catch(logError);

        setIsLoading(false);

        if (typeof cb === 'function') {
            cb(results);
        }
    });

    const debouncedSearch = useCallback(
        debounce((query, cb) => {
            fetchResults(query, cb);
        }, 600)
    );

    useEffect(() => {
        if (isEmpty(query)) {
            return setResults([]);
        }

        debouncedSearch(query, setResults);
    }, [query]);

    console.log('[SearchScreen #results]', results);

    return (
        <View style={[tailwind('bg-gray-800 flex-1 relative pt-4')]}>
            <View style={tailwind('px-4')}>
                <View style={[searchButtonStyle, tailwind('relative flex-row')]}>
                    <View style={tailwind('')}>
                        <FontAwesomeIcon icon={faSearch} size={18} style={[tailwind('text-gray-700 mr-3')]} />
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
                        style={tailwind('flex-1 h-full text-white rounded-md shadow-lg pr-2')}
                        placeholder={translate('Core.SearchScreen.searchInputPlaceholderText')}
                        placeholderTextColor={getColorCode('text-gray-600')}
                    />
                    {isLoading && (
                        <View style={tailwind('absolute inset-y-0 right-0 h-full items-center')}>
                            <View style={[tailwind('items-center justify-center flex-1 opacity-75 mr-10'), isEmpty(query) ? tailwind('mr-3.5') : null]}>
                                <ActivityIndicator color={getColorCode('text-gray-400')} />
                            </View>
                        </View>
                    )}
                </View>
            </View>

            <ScrollView style={tailwind('px-4')} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
                {results.map((order, index) => (
                    <OrderCard key={index} order={order} onPress={() => onOrderPress(order)} wrapperStyle={tailwind('px-0')} />
                ))}
                <View style={tailwind('w-full h-40')}></View>
            </ScrollView>
        </View>
    );
};

export default SearchScreen;
