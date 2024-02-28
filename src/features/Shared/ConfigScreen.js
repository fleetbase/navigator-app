import { faWindowClose } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import config from 'config';
import React, { useEffect, useState } from 'react';
import { SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import { EventRegister } from 'react-native-event-listeners';
import tailwind from 'tailwind';
import { translate } from 'utils';
import { getString, remove } from 'utils/Storage';

const { addEventListener, removeEventListener } = EventRegister;
const ConfigScreen = ({ navigation }) => {
    const { FLEETBASE_HOST, SOCKETCLUSTER_HOST, SOCKETCLUSTER_PORT } = config;
    const [host, setHost] = useState(FLEETBASE_HOST);
    const [editedSocketHost, setEditedSocketHost] = useState(SOCKETCLUSTER_HOST);
    const [editedSocketPort, setEditedSocketPort] = useState(SOCKETCLUSTER_PORT);

    let _FLEETBASE_HOST = getString('_FLEETBASE_HOST');
    let _SOCKET_HOST = getString('_SOCKET_HOST');
    let _SOCKET_PORT = getString('_SOCKET_PORT');

    const [isReseting, setIsReseting] = useState(false);

    useEffect(() => {
        const onUrlChange = addEventListener('configUrl', () => {
            setIsReseting(!isReseting);
        });

        return () => {
            removeEventListener(onUrlChange);
        };
    }, []);

    useEffect(() => {
        setHost(_FLEETBASE_HOST ? _FLEETBASE_HOST : FLEETBASE_HOST);
        setEditedSocketHost(_SOCKET_HOST ? _SOCKET_HOST : SOCKETCLUSTER_HOST);
        setEditedSocketPort(_SOCKET_PORT ? _SOCKET_PORT : SOCKETCLUSTER_PORT);
    }, [isReseting]);

    const handleReset = () => {
        remove('_FLEETBASE_HOST');
        remove('_FLEETBASE_KEY');
        remove('_SOCKET_HOST');
        remove('_SOCKET_PORT');
        setIsReseting(!isReseting);
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
                            {host}
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
                            {editedSocketHost}
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
                            {editedSocketPort}
                        </Text>
                    </View>
                </View>

                <View style={tailwind('flex items-start justify-start')}>
                    <View style={tailwind('flex flex-row items-center justify-center')}>
                        <TouchableOpacity onPress={handleReset}>
                            <View style={tailwind('btn bg-gray-900 border border-gray-700 ')}>
                                <Text style={tailwind('font-semibold text-gray-50 text-base')}>{translate('Shared.ConfigScreen.reset')}</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
};

export default ConfigScreen;
