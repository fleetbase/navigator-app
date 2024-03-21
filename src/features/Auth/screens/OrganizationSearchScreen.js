import { faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { searchButtonStyle } from 'components/SearchButton';
import { useFleetbase } from 'hooks';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import tailwind from 'tailwind';
import { getColorCode, isEmpty } from 'utils';

const isAndroid = Platform.OS === 'android';

const OrganizationSearchScreen = ({ navigation }) => {
    const fleetbase = useFleetbase();
    const internalInstance = useFleetbase('navigator/v1');
    const searchInput = useRef();

    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState([]);
    const [organizations, setOrganizations] = useState([]);
    const [settings, setSettings] = useState();
    const [search, setSearch] = useState('');

    const fetchOrganizations = async () => {
        try {
            const adapter = fleetbase.getAdapter();
            const response = await adapter.get('organizations', {
                with_driver_onboard: true,
            });
            setOrganizations(response);
            console.log('response---->', JSON.stringify(response));
            return response;
        } catch (error) {
            console.error('Error fetching organizations:', error);
            return [];
        }
    };

    const fetchSettings = async () => {
        try {
            const adapter = internalInstance.getAdapter();
            const response = await adapter.get('settings/driver-onboard-settings');
            setSettings(Object.keys(response.driverOnboardSettings)[0]);
            return response;
        } catch (error) {
            console.error('Error fetching organizations:', error);
            return [];
        }
    };

    useEffect(() => {
        fetchOrganizations();
        fetchSettings();
    }, []);

    const handleSearch = text => {
        setSearch(text);
        if (text === '') {
            setResults([]);
        } else {
            const filteredOrganizations = organizations.filter(org => org.name.toLowerCase().includes(text.toLowerCase()));
            setResults(filteredOrganizations);
        }
    };

    const renderItem = ({ item }) => (
        console.log('item', JSON.stringify(item)),
        (
            <View style={tailwind('p-4')}>
                <TouchableOpacity style={tailwind('p-3 bg-gray-900 border border-gray-800 rounded-xl shadow-sm')} onPress={() => navigation.navigate('SignUp', { organization: item })}>
                    <View style={tailwind('flex-1 flex-col items-start')}>
                        <Text style={tailwind('text-gray-100')}>{item.name}</Text>
                    </View>
                </TouchableOpacity>
            </View>
        )
    );

    return (
        <View style={[tailwind('bg-gray-800 flex-1 relative pt-4')]}>
            <View style={tailwind('px-4')}>
                <View style={[searchButtonStyle, tailwind('relative flex-row')]}>
                    <View style={tailwind('')}>
                        <FontAwesomeIcon icon={faSearch} size={18} style={[tailwind('text-gray-700 mr-3')]} />
                    </View>
                    <TextInput
                        ref={searchInput}
                        value={search}
                        onChangeText={handleSearch}
                        autoComplete={'off'}
                        autoCorrect={false}
                        autoCapitalize={'none'}
                        autoFocus={isAndroid ? false : true}
                        clearButtonMode={'while-editing'}
                        textAlign={'left'}
                        style={tailwind('flex-1 h-full text-white')}
                        placeholder={'Search Organizations..'}
                        placeholderTextColor={getColorCode('text-gray-600')}
                    />
                    {isLoading && (
                        <View style={tailwind('absolute inset-y-0 right-0 h-full items-center')}>
                            <View style={[tailwind('items-center justify-center flex-1 opacity-75 mr-10'), isEmpty(search) ? tailwind('mr-3.5') : null]}>
                                <ActivityIndicator color={getColorCode('text-gray-400')} />
                            </View>
                        </View>
                    )}
                </View>
            </View>
            <FlatList data={results} renderItem={renderItem} keyExtractor={(item, index) => index.toString()} contentContainerStyle={{ flexGrow: 1 }} />
        </View>
    );
};

export default OrganizationSearchScreen;
