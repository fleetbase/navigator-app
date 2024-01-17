import { faWindowClose } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import config from 'config';
import React from 'react';
import { SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import tailwind from 'tailwind';

let { SOCKETCLUSTER_PORT, SOCKETCLUSTER_HOST, FLEETBASE_HOST } = config;
const ConfigScreen = ({ navigation }) => {
    return (
        <SafeAreaView style={tailwind('w-full h-full bg-gray-800 flex-grow')}>
            <View style={tailwind('flex flex-row items-center p-4 ')}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('rounded-full')}>
                    <FontAwesomeIcon size="25" icon={faWindowClose} style={tailwind('text-red-400')} />
                </TouchableOpacity>
            </View>
            <View style={[tailwind('p-4')]}>
                <View style={[tailwind('mb-5 bg-gray-900 border border-gray-700 p-4')]}>
                    <Text style={tailwind('font-mono text-gray-50 text-sm')} numberOfLines={1}>{`SOCKET PORT: ${SOCKETCLUSTER_PORT}`}</Text>
                    <Text style={tailwind('font-mono text-gray-50 text-sm')} numberOfLines={1}>{`SOCKET HOST: ${SOCKETCLUSTER_HOST}`}</Text>
                    <Text style={tailwind('font-mono text-gray-50 text-sm')} numberOfLines={1}>{`FLEETBASE HOST: ${FLEETBASE_HOST}`}</Text>
                </View>
            </View>
        </SafeAreaView>
    );
};

export default ConfigScreen;
