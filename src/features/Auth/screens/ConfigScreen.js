import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import config from 'config';
import { faWindowClose } from '@fortawesome/free-solid-svg-icons';
import tailwind from 'tailwind';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

let { SOCKETCLUSTER_PORT, SOCKETCLUSTER_HOST } = config;
const ConfigScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    return (
        <View style={[tailwind('bg-gray-800 flex-row flex-1 items-center justify-center'), { paddingTop: insets.top }]}>
            <View style={tailwind('w-full h-full bg-gray-800 flex-grow')}>
                <View style={tailwind('flex flex-row items-center p-4')}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('rounded-full')}>
                        <FontAwesomeIcon size="25" icon={faWindowClose} style={tailwind('text-red-400')} />
                    </TouchableOpacity>
                </View>
                <View style={tailwind('btn bg-gray-900 border border-gray-700 p-4 rounded shadow')}>
                    <Text style={tailwind('font-semibold text-gray-50 text-lg text-center')}>{`Socket Cluster Port is ${SOCKETCLUSTER_PORT}`}</Text>
                    <Text style={tailwind('font-semibold text-gray-50 text-lg text-center')}>{`Socket Cluster Host is:  ${SOCKETCLUSTER_HOST}`}</Text>
                </View>
            </View>
        </View>
    );
};

export default ConfigScreen;
