import { faAngleLeft, faPhone, faVideo,faPaperPlane } from '@fortawesome/free-solid-svg-icons';
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
                <View style={tailwind('rounded-full bg-blue-500 p-2 mb-2 mr-2')}>
                    <FontAwesomeIcon icon={faPaperPlane} size={14} color="#fff" />
                </View>
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
        <View style={tailwind('w-full h-full bg-gray-200 flex-grow p-2')}>
            <View style={tailwind('flex flex-row ')}>
                <TouchableOpacity style={tailwind('p-2')} onPress={() => navigation.goBack()}>
                    <FontAwesomeIcon size={25} icon={faAngleLeft} style={tailwind('text-blue-500')} />
                </TouchableOpacity>
                <View style={tailwind('flex ml-2')}>
                    <View style={tailwind('flex flex-col ml-2 mt-4')}>
                        <Text style={tailwind('text-sm text-gray-600 w-64 text-center')}>{'name'}</Text>
                    </View>
                </View>
                <View style={tailwind('flex flex-col items-center mr-4')}>
                    <TouchableOpacity style={tailwind('rounded-full mt-4 ')}>
                        <FontAwesomeIcon size={18} icon={faPhone} style={[tailwind('text-blue-500'), { transform: [{ rotate: '90deg' }] }]} />
                    </TouchableOpacity>
                </View>
                <View style={tailwind('flex flex-col items-center mr-4')}>
                    <TouchableOpacity style={tailwind('rounded-full mt-4')}>
                        <FontAwesomeIcon size={22} icon={faVideo} style={tailwind('text-blue-500')} />
                    </TouchableOpacity>
                </View>
            </View>
            <View style={tailwind('flex-1 p-4 mb-4')}>
                <GiftedChat
                    messages={messages}
                    onSend={messages => onSend(messages)}
                    user={{
                        _id: 1,
                    }}
                    renderBubble={renderBubble}
                    alwaysShowSend
                    scrollToBottom
                    renderSend={renderSend}
                    scrollToBottomComponent={scrollToBottomComponent}
                />
            </View>
        </View>
    );
};

export default ChatScreen;
