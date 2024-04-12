import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { useFleetbase } from 'hooks';
import FastImage from 'react-native-fast-image';
import { format } from 'date-fns';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { tailwind } from 'tailwind';

const ChatsScreen = () => {
    const navigation = useNavigation();
    const fleetbase = useFleetbase();
    const [channel, setChannel] = useState([]);

    const fetchChannels = async () => {
        try {
            const adapter = fleetbase.getAdapter();
            const response = await adapter.get('chat-channels');
            setChannel(response);
            return response;
        } catch (error) {
            console.error('Error fetching  channel:', error);
            return [];
        }
    };

    const formatTime = dateTime => {
        const date = new Date(dateTime);
        const formattedTime = format(date, 'HH:mm');
        return formattedTime;
    };

    useEffect(() => {
        fetchChannels();
    }, []);

    const MessageItem = ({ imageUri, name, message, time }) => {
        return (
            <TouchableOpacity onPress={() => navigation.navigate('ChatScreen')} style={tailwind('flex flex-row bg-gray-900 mt-2 p-2 rounded mx-2')}>
                <View style={tailwind('p-2')}>
                    <FastImage source={imageUri ? { uri: imageUri } : require('../../../../assets/icon.png')} style={tailwind('w-10 h-10 rounded-full')} />
                </View>
                <View style={tailwind('flex ml-2')}>
                    <View style={tailwind('flex flex-col ml-2')}>
                        <Text style={tailwind('font-medium text-white')}>{name}</Text>
                        <Text style={tailwind('text-sm text-gray-400 w-64')}>{message}</Text>
                    </View>
                </View>
                <View style={tailwind('flex flex-col items-center right-2')}>
                    <Text style={tailwind('text-gray-600')}>{formatTime(time)}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={tailwind('w-full h-full bg-gray-800')}>
            <ScrollView>
                {channel.map(item => (
                    <MessageItem key={item.id} imageUri={item.participants.avatar_url} name={item.name} message={item.message} time={item.created_at} />
                ))}
                <View style={tailwind('p-4')}>
                    <View style={tailwind('flex flex-row items-center justify-center')}>
                        <TouchableOpacity style={tailwind('flex-1')} onPress={() => navigation.navigate('ChatScreen', { channelData: item })}>
                            <View style={tailwind('btn bg-gray-900 border border-gray-700')}>
                                <Text style={tailwind('font-semibold text-gray-50 text-base')}>{'create'}</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
};

export default ChatsScreen;
