import { faWindowClose } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useConfig } from 'hooks';
import React, { useState } from 'react';
import { SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import tailwind from 'tailwind';
import { translate } from 'utils';
import { clear, setString, remove } from 'utils/Storage';

const ConfigScreen = ({ navigation }) => {
    const { FLEETBASE_HOST, SOCKETCLUSTER_HOST, SOCKETCLUSTER_PORT } = useConfig();
    const [isReseting, setIsReseting] = useState(false);

    const handleReset = () => {
        setIsReseting(true)
        remove('_FLEETBASE_HOST');
        remove('_SOCKET_HOST');
        remove('_SOCKET_PORT');
        setIsReseting(false)

    };

    const handleSave = () => {
        // setString('_FLEETBASE_HOST', editedHost);
        // setString('_SOCKET_HOST', editedSocketHost);
        // setString('_SOCKET_PORT', editedSocketPort);
    };

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
                            {translate('Shared.ConfigScreen.host').toUpperCase().concat(':')}
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
                            {translate('Shared.ConfigScreen.socket').toUpperCase().concat(':')}
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
                            {translate('Shared.ConfigScreen.port').toUpperCase().concat(':')}
                        </Text>
                    </View>

                    <View style={[tailwind('px-4 py-2 flex flex-row items-center rounded-r-md')]}>
                        <Text style={tailwind('text-gray-50 text-xs')} numberOfLines={1}>
                            {SOCKETCLUSTER_PORT}
                        </Text>
                    </View>
                </View>

                <View style={tailwind('flex flex-row items-center justify-center px-8')}>
                    <View style={tailwind('flex flex-row items-center justify-center')}>
                        <TouchableOpacity onPress={handleReset}>
                            <View style={tailwind('btn bg-gray-900 border border-gray-700 ')}>
                                <Text style={tailwind('font-semibold text-gray-50 text-base')}>{translate('Shared.ConfigScreen.reset')}</Text>
                            </View>
                        </TouchableOpacity>
                    </View>

                    <View style={tailwind('flex flex-row items-center justify-center')}>
                        <TouchableOpacity onPress={handleSave}>
                            <View style={tailwind('btn bg-gray-900 border border-gray-700')}>
                                <Text style={tailwind('font-semibold text-gray-50 text-base')}>{translate('Shared.ConfigScreen.save')}</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
};

export default ConfigScreen;
