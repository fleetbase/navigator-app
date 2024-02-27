import { faWindowClose } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import config from 'config';
import React, { useEffect, useState } from 'react';
import { SafeAreaView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import tailwind from 'tailwind';
import { getString, setString } from 'utils/Storage';
import { translate } from 'utils';

let { SOCKETCLUSTER_PORT, SOCKETCLUSTER_HOST, FLEETBASE_HOST } = config;
const ConfigScreen = ({ navigation }) => {
    const [editable, setEditable] = useState(false);
    const [editedHost, setEditedHost] = useState('...');
    const [editedSocketHost, setEditedSocketHost] = useState('...');
    const [editedSocketPort, setEditedSocketPort] = useState('...');

    console.log('test::::', FLEETBASE_HOST, SOCKETCLUSTER_PORT, SOCKETCLUSTER_HOST);
    useEffect(() => {
        getConfigs();
    }, []);

    const getConfigs = () => {
        let _FLEETBASE_HOST = getString('_FLEETBASE_HOST');
        let _SOCKET_HOST = getString('_SOCKET_HOST');
        let _SOCKET_PORT = getString('_SOCKET_PORT');

        console.log('Keys: ', _FLEETBASE_HOST, _SOCKET_HOST, _SOCKET_PORT);

        if (_FLEETBASE_HOST) {
            FLEETBASE_HOST = _FLEETBASE_HOST;
        }

        if (_SOCKET_HOST) {
            SOCKETCLUSTER_HOST = _SOCKET_HOST;
        }

        if (_SOCKET_PORT) {
            SOCKETCLUSTER_PORT = _SOCKET_PORT;
        }
    };

    const handleEdit = () => {
        setEditable(true);
    };

    const handleSave = () => {
        setEditable(false);
        setString('_FLEETBASE_HOST', editedHost);
        setString('_SOCKET_HOST', editedSocketHost);
        setString('_SOCKET_PORT', editedSocketPort);
        console.log('handleSave:::::', editedHost, editedSocketHost, editedSocketPort);
        getConfigs();
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
                    {editable ? (
                        <TextInput style={[tailwind('px-4 py-2 flex flex-row items-center rounded-r-md text-gray-50 text-xs')]} value={editedHost} onChangeText={setEditedHost} />
                    ) : (
                        <View style={[tailwind('px-4 py-2 flex flex-row items-center rounded-r-md')]}>
                            <Text style={tailwind('text-gray-50 text-xs')} numberOfLines={1}>
                                {FLEETBASE_HOST}
                            </Text>
                        </View>
                    )}
                </View>
                <View style={[tailwind('bg-gray-900 border border-gray-700 rounded-md flex flex-row items-center mb-6')]}>
                    <View style={[tailwind('border-r border-gray-700 bg-gray-200 px-4 py-2 flex flex-row items-center rounded-l-md'), { width: 150 }]}>
                        <Text style={tailwind('text-xs font-semibold text-black')} numberOfLines={1}>
                            {translate('Shared.ConfigScreen.socket').toUpperCase().concat(':')}
                        </Text>
                    </View>
                    {editable ? (
                        <TextInput style={[tailwind('px-4 py-2 flex flex-row items-center rounded-r-md text-gray-50 text-xs')]} value={editedSocketHost} onChangeText={setEditedSocketHost} />
                    ) : (
                        <View style={[tailwind('px-4 py-2 flex flex-row items-center rounded-r-md')]}>
                            <Text style={tailwind('text-gray-50 text-xs')} numberOfLines={1}>
                                {SOCKETCLUSTER_HOST}
                            </Text>
                        </View>
                    )}
                </View>
                <View style={[tailwind('bg-gray-900 border border-gray-700 rounded-md flex flex-row items-center mb-6')]}>
                    <View style={[tailwind('border-r border-gray-700 bg-gray-200 px-4 py-2 flex flex-row items-center rounded-l-md'), { width: 150 }]}>
                        <Text style={tailwind('text-xs font-semibold text-black')} numberOfLines={1}>
                            {translate('Shared.ConfigScreen.port').toUpperCase().concat(':')}
                        </Text>
                    </View>
                    {editable ? (
                        <TextInput style={[tailwind('px-4 py-2 flex flex-row items-center rounded-r-md text-gray-50 text-xs')]} value={editedSocketPort} onChangeText={setEditedSocketPort} />
                    ) : (
                        <View style={[tailwind('px-4 py-2 flex flex-row items-center rounded-r-md')]}>
                            <Text style={tailwind('text-gray-50 text-xs')} numberOfLines={1}>
                                {SOCKETCLUSTER_PORT}
                            </Text>
                        </View>
                    )}
                </View>

                <View style={tailwind('flex flex-row  justify-center p-8')}>
                    <View style={tailwind('p-4')}>
                        <View style={tailwind('flex flex-row items-center justify-center ')}>
                            <TouchableOpacity onPress={handleEdit}>
                                <View style={tailwind('btn bg-gray-900 border border-gray-700 ')}>
                                    <Text style={tailwind('font-semibold text-gray-50 text-base')}>{translate('Shared.ConfigScreen.reset')}</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={tailwind('p-4')}>
                        <View style={tailwind('flex flex-row items-center justify-center')}>
                            <TouchableOpacity onPress={handleSave}>
                                <View style={tailwind('btn bg-gray-900 border border-gray-700')}>
                                    <Text style={tailwind('font-semibold text-gray-50 text-base')}>{translate('Shared.ConfigScreen.save')}</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
};

export default ConfigScreen;
