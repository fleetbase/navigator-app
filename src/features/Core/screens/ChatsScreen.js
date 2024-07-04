import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { useFleetbase, useMountedState } from 'hooks';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableHighlight, TouchableOpacity, View, Platform } from 'react-native';
import FastImage from 'react-native-fast-image';
import { SwipeListView } from 'react-native-swipe-list-view';
import Toast from 'react-native-toast-message';
import { tailwind } from 'tailwind';
import { translate } from 'utils';

const isAndroid = Platform.OS === 'android';

const ChatsScreen = () => {
    const navigation = useNavigation();
    const isMounted = useMountedState();
    const fleetbase = useFleetbase();
    const [channels, setChannels] = useState([]);
    const [isCreatingChat, setIsCreatingChat] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            fetchChannels();
        });

        return unsubscribe;
    }, [isMounted]);

    const fetchChannels = async () => {
        setIsLoading(true);
        try {
            const adapter = fleetbase.getAdapter();
            const response = await adapter.get('chat-channels');
            setChannels(response);
            setIsLoading(false);
            return response;
        } catch (error) {
            console.error('Error fetching channels:', error);
            setIsLoading(false);
            return [];
        }
    };

    const formatTime = dateTime => {
        const date = new Date(dateTime);
        const formattedTime = format(date, 'HH:mm');
        return formattedTime;
    };

    const handleDelete = async itemId => {
        try {
            const adapter = fleetbase.getAdapter();
            await adapter.delete(`chat-channels/${itemId}`).then(res => {
                Toast.show({
                    type: 'success',
                    text1: `Channel deleted`,
                });
            });
            setChannels(channels.filter(item => item.id !== itemId));
        } catch (error) {
            console.error('Error deleting channel:', error);
        }
    };

    const renderItem = ({ item }) => (
        <TouchableHighlight
            style={tailwind('flex flex-row bg-gray-900 mt-2 p-2 mx-4 rounded-lg')}
            onPress={() => navigation.navigate('ChatScreen', { channel: item })}
            underlayColor={tailwind('bg-gray-900')}>
            <View style={tailwind('flex flex-row')}>
                <FastImage
                    source={item.participants.avatar_url ? { uri: item.participants.avatar_url } : require('../../../../assets/icon.png')}
                    style={tailwind('w-10 h-10 rounded-full')}
                />
                <View style={tailwind('flex ml-2')}>
                    <Text style={tailwind('font-medium text-white')}>{item.name}</Text>
                    <Text style={tailwind('text-sm text-gray-400 w-64')}>{item?.last_message?.content}</Text>
                </View>
                <View style={isAndroid ? tailwind('flex flex-col items-center right-8') : tailwind('flex flex-col items-center right-2')}>
                    <Text style={tailwind('text-gray-600')}>{formatTime(item.created_at)}</Text>
                </View>
            </View>
        </TouchableHighlight>
    );

    const renderHiddenItem = ({ item }) => (
        <View style={tailwind('w-full h-full p-2')}>
            <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.backRightBtn, styles.backRightBtnRight]}>
                <Text style={tailwind('text-white font-semibold')}>{translate('Core.ChatsScreen.delete')}</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={tailwind('w-full h-full bg-gray-800')}>
            <>
                <View style={tailwind('p-4')}>
                    <View style={tailwind('flex flex-row items-center justify-center')}>
                        <TouchableOpacity style={tailwind('flex-1')} onPress={() => navigation.navigate('ChannelScreen')}>
                            <View style={tailwind('btn bg-gray-900 border border-gray-700')}>
                                <Text style={tailwind('font-semibold text-gray-50 text-base')}>{translate('Core.ChatsScreen.create-channel')}</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
                <SwipeListView data={channels} renderItem={renderItem} renderHiddenItem={renderHiddenItem} rightOpenValue={-75} />
            </>
        </View>
    );
};

export default ChatsScreen;

const styles = StyleSheet.create({
    backRightBtn: {
        alignItems: 'center',
        bottom: 0,
        justifyContent: 'center',
        position: 'absolute',
        top: 0,
        width: 75,
    },
    backRightBtnRight: {
        backgroundColor: '#FF3A3A',
        right: 4,
        top: 10,
        bottom: 2,
        marginRight: 12,
        marginLeft: 6,
        borderRadius: 12,
    },
    loaderContainer: {
        position: 'absolute',
        top: '50%',
        left: '60%',
        transform: [{ translateX: -50 }, { translateY: -50 }],
        zIndex: 10,
    },
});
