import { faWindowClose } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useFleetbase } from 'hooks';
import React from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import tailwind from 'tailwind';

const Organization = ({ route, navigation }) => {
    const { organizations } = route.params;
    const fleetbase = useFleetbase();

    const switchOrg = organizationId => {
        fleetbase.drivers.switchOrganization(organizationId).then(res => {
            console.log('Success', res);
        });
    };

    const renderItem = ({ item }) => (
        <TouchableOpacity onPress={() => switchOrg(item.attributes.id)}>
            <View style={[tailwind('p-1')]}>
                <View style={[tailwind('px-4 py-2 flex flex-row items-center rounded-r-md')]}>
                    <Text style={tailwind('text-gray-50 text-base')} numberOfLines={1}>
                        <Text>{item.attributes.name}</Text>
                    </Text>
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
            <FlatList data={organizations} keyExtractor={item => item.id.toString()} renderItem={renderItem} />
        </View>
    );
};

export default Organization;
