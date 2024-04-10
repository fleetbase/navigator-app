import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { tailwind } from 'tailwind';

const ChatsScreen = () => {
    const navigation = useNavigation();

    const messages = [
        {
            id: 1,
            imageUri: 'https://i.imgur.com/aq39RMA.jpg',
            name: 'Jessica Koel',
            message: "Hey, Joel, I'm here to help you out please tell me",
            time: '11:26',
        },
        {
            id: 2,
            imageUri: 'https://i.imgur.com/eMaYwXn.jpg',
            name: 'Komeial Bolger',
            message: 'I will send you all documents as soon as possible',
            time: '12:26',
        },
        {
            id: 3,
            imageUri: 'https://i.imgur.com/zQZSWrt.jpg',
            name: 'Tamaara Suiale',
            message: 'Are you going on a business trip next week?',
            time: '8:26',
        },
        {
            id: 4,
            imageUri: 'https://i.imgur.com/agRGhBc.jpg',
            name: 'Sam Nielson',
            message: 'I suggest starting a new business soon',
            time: '7:16',
        },
        {
            id: 5,
            imageUri: 'https://i.imgur.com/uIgDDDd.jpg',
            name: 'Caroline Nexon',
            message: 'We need to start a new research center.',
            time: '9:26',
        },
        {
            id: 6,
            imageUri: 'https://i.imgur.com/tT8rjKC.jpg',
            name: 'Patrick Koeler',
            message: 'Maybe yes',
            time: '3:26',
        },
    ];

    const MessageItem = ({ imageUri, name, message, time }) => {
        return (
            <TouchableOpacity onPress={() => navigation.navigate('ChatScreen')} style={tailwind('flex flex-row bg-gray-100 mt-2 p-2 rounded mx-2')}>
                <View style={tailwind('p-2')}>
                    <Image source={{ uri: imageUri }} style={tailwind('rounded-full w-10 h-10')} />
                </View>
                <View style={tailwind('flex ml-2')}>
                    <View style={tailwind('flex flex-col ml-2')}>
                        <Text style={tailwind('font-medium text-black')}>{name}</Text>
                        <Text style={tailwind('text-sm text-gray-400 w-64')}>{message}</Text>
                    </View>
                </View>
                <View style={tailwind('flex flex-col items-center mr-4')}>
                    <Text style={tailwind('text-gray-600 ')}>{time}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={tailwind('w-full h-full bg-gray-800 flex-grow')}>
            <ScrollView>
                {messages.map(message => (
                    <MessageItem key={message.id} imageUri={message.imageUri} name={message.name} message={message.message} time={message.time} />
                ))}
            </ScrollView>
        </View>
    );
};

export default ChatsScreen;
