import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useNavigation } from '@react-navigation/native';
import { useFleetbase } from 'hooks';
import React, { useEffect, useState } from 'react';
import Toast from 'react-native-toast-message';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import tailwind from 'tailwind';
import { getColorCode, logError, translate } from 'utils';

const ChannelScreen = ({ route }) => {
    const navigation = useNavigation();
    const fleetbase = useFleetbase();
    const [name, setName] = useState();
    const [isLoading, setIsLoading] = useState(false);
    const [channelId, setChannelId] = useState();

    useEffect(() => {
        if (route?.params) {
            const { data } = route.params;
            setChannelId(data?.id);
            setName(data?.name);
        }
    }, [route]);

    const saveChannel = () => {
        setIsLoading(true);
        const adapter = fleetbase.getAdapter();
        const data = { name };
        if (channelId) {
            return adapter
                .put(`chat-channels/${channelId}`, data)
                .then((res) => {
                    navigation.navigate('ChatScreen', { channel: res });
                })
                .catch(logError)
                .finally(() => setIsLoading(false));
        } else {
            return adapter
                .post('chat-channels', { name })
                .then((res) => {
                    navigation.navigate('ChatScreen', { channel: res });
                    Toast.show({
                        type: 'success',
                        text1: `Channel created successfully`,
                    });
                })
                .catch(logError)
                .finally(() => setIsLoading(false));
        }
    };

    return (
        <View style={[tailwind('w-full h-full bg-gray-800')]}>
            <Pressable onPress={Keyboard.dismiss} style={tailwind('w-full h-full relative')}>
                <View style={tailwind('flex flex-row items-center justify-between p-4')}>
                    <Text style={tailwind('text-xl text-gray-50 font-semibold')}>{channelId ? translate('Core.ChannelScreen.update-channel') : translate('Core.ChannelScreen.title')}</Text>
                    <TouchableOpacity onPress={() => navigation.pop(2)} style={tailwind('mr-4')}>
                        <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                            <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                        </View>
                    </TouchableOpacity>
                </View>
                <View style={tailwind('flex w-full h-full')}>
                    <KeyboardAvoidingView style={tailwind('p-4')}>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>
                                {channelId ? translate('Core.ChannelScreen.update') : translate('Core.ChannelScreen.name')}
                            </Text>
                            <TextInput
                                value={name}
                                onChangeText={setName}
                                keyboardType={'default'}
                                placeholder={translate('Core.ChannelScreen.name')}
                                placeholderTextColor={getColorCode('text-gray-600')}
                                style={tailwind('form-input text-white')}
                            />
                        </View>

                        <TouchableOpacity onPress={saveChannel} disabled={isLoading}>
                            <View style={tailwind('btn bg-gray-900 border border-gray-700 mt-4')}>
                                {isLoading && <ActivityIndicator color={getColorCode('text-gray-50')} style={tailwind('mr-2')} />}
                                <Text style={tailwind('font-semibold text-lg text-gray-50 text-center')}>
                                    {channelId ? translate('Core.ChannelScreen.update-channel') : translate('Core.ChannelScreen.title')}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </KeyboardAvoidingView>
                </View>
            </Pressable>
        </View>
    );
};

export default ChannelScreen;
