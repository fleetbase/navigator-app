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
            <View style={tailwind('flex flex-row items-center justify-between p-4 ')}>
                <View>
                    <Text style={tailwind('font-bold text-white text-base')}>Instance Configuration</Text>
                </View>
                <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('rounded-full')}>
                    <FontAwesomeIcon size={20} icon={faWindowClose} style={tailwind('text-red-400')} />
                </TouchableOpacity>
            </View>
            <View style={[tailwind('p-4')]}>
                <View style={[tailwind('bg-gray-900 border border-gray-700 rounded-md flex flex-row items-center mb-6')]}>
                    <View style={[tailwind('border-r border-gray-700 bg-gray-200 px-4 py-2 flex flex-row items-center rounded-l-md'), { width: 150 }]}>
                        <Text style={tailwind('text-xs font-semibold text-black')} numberOfLines={1}>
                            HOST:
                        </Text>
                    </View>
                    <View style={[tailwind('px-4 py-2 flex flex-row items-center rounded-r-md')]}>
                        <Text style={tailwind('text-gray-50 text-xs')} numberOfLines={1}>
                            {FLEETBASE_HOST}
                        </Text>
                    </View>
                </View>
                <View style={[tailwind('bg-gray-900 border border-gray-700 rounded-md flex flex-row items-center mb-6')]}>
                    <View style={[tailwind('border-r border-gray-700 bg-gray-200 px-4 py-2 flex flex-row items-center rounded-l-md'), { width: 150 }]}>
                        <Text style={tailwind('text-xs font-semibold text-black')} numberOfLines={1}>
                            SOCKET HOST:
                        </Text>
                    </View>
                    <View style={[tailwind('px-4 py-2 flex flex-row items-center rounded-r-md')]}>
                        <Text style={tailwind('text-gray-50 text-xs')} numberOfLines={1}>
                            {SOCKETCLUSTER_HOST}
                        </Text>
                    </View>
                </View>
                <View style={[tailwind('bg-gray-900 border border-gray-700 rounded-md flex flex-row items-center mb-6')]}>
                    <View style={[tailwind('border-r border-gray-700 bg-gray-200 px-4 py-2 flex flex-row items-center rounded-l-md'), { width: 150 }]}>
                        <Text style={tailwind('text-xs font-semibold text-black')} numberOfLines={1}>
                            SOCKET PORT:
                        </Text>
                    </View>
                    <View style={[tailwind('px-4 py-2 flex flex-row items-center rounded-r-md')]}>
                        <Text style={tailwind('text-gray-50 text-xs')} numberOfLines={1}>
                            {SOCKETCLUSTER_PORT}
                        </Text>
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
};

export default ConfigScreen;
