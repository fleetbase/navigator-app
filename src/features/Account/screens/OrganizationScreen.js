import React from 'react';
import { faWindowClose } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useFleetbase, useLocale } from 'hooks';
import { FlatList, TouchableOpacity, View, Text } from 'react-native';
import tailwind from 'tailwind';

const Organization = ({ route, navigation }) => {
    const { data } = route.params;
    const fleetbase = useFleetbase();
    const switchOrg = organizationId => {
        fleetbase.drivers.switchOrganization(organizationId).then(res => {
            console.log('Success');
        });
    };

    console.log('data----->', JSON.stringify(data));

    const renderItem = ({ item }) => (
        <TouchableOpacity onPress={() => onPressItem(switchOrg(item.id))}>
            <View style={[tailwind('p-1')]}>
                {/* <View style={[tailwind('bg-gray-900 border border-gray-700 rounded-md flex flex-row items-center ')]}> */}
                <View style={[tailwind('px-4 py-2 flex flex-row items-center rounded-r-md')]}>
                    <Text style={tailwind('text-gray-50 text-base')} numberOfLines={1}>
                        <Text>{item.name}</Text>
                    </Text>
                    {/* </View> */}
                </View>
            </View>
        </TouchableOpacity>
    );
    return (
        <View style={tailwind('w-full h-full bg-gray-800 flex-grow')}>
            <View style={tailwind('flex flex-row items-center justify-between p-4 ')}>
                <View>
                    <Text style={tailwind('font-bold text-white text-lg')}>Organizations</Text>
                </View>
                <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('rounded-full')}>
                    <FontAwesomeIcon size={20} icon={faWindowClose} style={tailwind('text-red-400')} />
                </TouchableOpacity>
            </View>
            <FlatList data={data} keyExtractor={item => item.id.toString()} renderItem={renderItem} />
        </View>
    );
};

export default Organization;
