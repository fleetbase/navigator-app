import React, { useState } from 'react';
import { FlatList, TouchableOpacity, View, Image, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { tailwind } from 'tailwind';

const MessageScreen = () => {
    const navigation = useNavigation();
    const [messages, setMessages] = useState([]);

    const Messages = [
        {
            id: '1',
            userName: 'Jenny Doe',
            userImg: 'image',
            messageTime: '4 mins ago',
            messageText: 'Hi, How are you?',
        },
        {
            id: '2',
            userName: 'John Doe',
            userImg: 'image',
            messageTime: '2 hours ago',
            messageText: 'Hi, How are you?',
        },
        {
            id: '3',
            userName: 'Ken William',
            userImg: 'image',
            messageTime: '1 hours ago',
            messageText: 'Hi, How are you?',
        },
        {
            id: '4',
            userName: 'Selina Paul',
            userImg: 'image',
            messageTime: '1 day ago',
            messageText: 'Hi, How are you?',
        },
        {
            id: '5',
            userName: 'Christy Alex',
            userImg: 'image',
            messageTime: '2 days ago',
            messageText: 'Hi, How are you?',
        },
    ];

    return (
        <View style={tailwind('flex flex-1 items-center bg-white')}>
            <FlatList
                data={Messages}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <TouchableOpacity style={tailwind('w-full')} onPress={() => navigation.navigate('ChatScreen', { userName: item.userName })}>
                        <View style={tailwind('inset-x-4')}>
                            {/* <Image style={tailwind('w-50 h-50 rounded-full')} source={item.userImg} /> */}
                            <View style={tailwind('flex flex-row justify-between mb-3.5 justify-center border-b border-gray-300')}>
                                <Text>{item.userName}</Text>
                                <Text>{item.messageTime}</Text>
                            </View>
                            <Text style={tailwind('text-base text-gray-700')}>{item.messageText}</Text>
                        </View>
                    </TouchableOpacity>
                )}
            />
        </View>
    );
};

export default MessageScreen;
