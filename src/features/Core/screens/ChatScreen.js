import { faAngleLeft, faPhone, faPhotoVideo } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Bubble, GiftedChat, Send } from 'react-native-gifted-chat';
import { tailwind } from 'tailwind';

const ChatScreen = () => {
    const navigation = useNavigation();
    const [messages, setMessages] = useState([]);

    useEffect(() => {
        setMessages([
            {
                _id: 1,
                text: 'Hello developer',
                createdAt: new Date(),
                user: {
                    _id: 2,
                    name: 'React Native',
                    avatar: 'https://placeimg.com/140/140/any',
                },
            },
            {
                _id: 2,
                text: 'Hello world',
                createdAt: new Date(),
                user: {
                    _id: 1,
                    name: 'React Native',
                    avatar: 'https://placeimg.com/140/140/any',
                },
            },
        ]);
    }, []);

    const onSend = useCallback((messages = []) => {
        setMessages(previousMessages => GiftedChat.append(previousMessages, messages));
    }, []);

    const renderSend = props => {
        return (
            <Send {...props}>
                <View></View>
            </Send>
        );
    };

    const renderBubble = props => {
        return (
            <Bubble
                {...props}
                wrapperStyle={{
                    right: {
                        backgroundColor: '#2e64e5',
                    },
                }}
                textStyle={{
                    right: {
                        color: '#fff',
                    },
                }}
            />
        );
    };

    const scrollToBottomComponent = () => {
        return <FontAwesomeIcon name="angle-double-down" size={22} color="#333" />;
    };

    return (
        <View style={tailwind('w-full h-full bg-gray-800 flex-grow')}>
            <View style={tailwind('flex flex-row items-center justify-between p-4 ')}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('rounded-full ')}>
                    <FontAwesomeIcon size={25} icon={faAngleLeft} style={tailwind('text-red-300')} />
                </TouchableOpacity>
                <View>
                    <Text style={tailwind('font-bold text-white text-base')}>{'Name'}</Text>
                </View>
                <TouchableOpacity style={tailwind('rounded-full ')}>
                    <FontAwesomeIcon size={18} icon={faPhone} style={tailwind('text-red-400 ')} />
                </TouchableOpacity>
                <TouchableOpacity style={tailwind('rounded-full ')}>
                    <FontAwesomeIcon size={18} icon={faPhotoVideo} style={tailwind('text-red-400 ')} />
                </TouchableOpacity>
            </View>
            <View style={tailwind('flex-1 p-6')}>
                <GiftedChat
                    messages={messages}
                    onSend={messages => onSend(messages)}
                    user={{
                        _id: 1,
                    }}
                    renderBubble={renderBubble}
                    alwaysShowSend
                    scrollToBottom
                    scrollToBottomComponent={scrollToBottomComponent}
                />
            </View>
        </View>
    );
};

export default ChatScreen;
