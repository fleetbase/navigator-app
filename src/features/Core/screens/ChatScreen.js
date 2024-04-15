import { faAngleLeft, faPaperPlane, faUpload, faUser } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useNavigation } from '@react-navigation/native';
import { useFleetbase } from 'hooks';
import React, { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Actions, Bubble, GiftedChat, InputToolbar, Send } from 'react-native-gifted-chat';
import { tailwind } from 'tailwind';

const ChatScreen = ({ route }) => {
    const { data, channelData } = route.params;

    const fleetbase = useFleetbase();
    const getUser = useFleetbase('int/v1');
    const navigation = useNavigation();
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState();
    const [users, setUsers] = useState([]);

    const fetchUsers = async () => {
        try {
            const adapter = getUser.getAdapter();
            const response = await adapter.get('users');
            console.log('user::::', JSON.stringify(response));
            setUsers(response.name);
            return response;
        } catch (error) {
            console.error('Error fetching users:', error);
            return [];
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const addParticipant = async id => {
        try {
            const adapter = fleetbase.getAdapter();
            const res = await adapter.delete(`chat-channels/${id}/add-participant`);
            console.log('res:::', JSON.stringify(res));
        } catch (error) {
            console.error('Add participant:', error);
        }
    };

    const removeParticipant = async participantId => {
        try {
            const adapter = fleetbase.getAdapter();
            const res = await adapter.delete(`chat-channels/remove-participant/${participantId}`);
            console.log('res:::', JSON.stringify(res));
        } catch (error) {
            console.error('Remove participant:', error);
        }
    };

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
                <FontAwesomeIcon icon={faPaperPlane} size={20} color="#168AFF" style={tailwind('mr-2')} />
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

    const renderActions = () => (
        <Actions
            options={{
                'Choose From Library': () => {
                    console.log('Choose From Library');
                },
                Cancel: () => {
                    console.log('Cancel');
                },
            }}
            optionTintColor="#222B45"
        />
    );

    const MessengerBarContainer = props => {
        return <InputToolbar {...props} containerStyle={tailwind('bg-white items-center justify-center mx-2 rounded-lg mb-0')} />;
    };

    const AdditionalContainer = () => {
        return (
            <View style={tailwind('flex flex-row items-center justify-center')}>
                <TouchableOpacity style={tailwind('p-2 mb-1')}>
                    <FontAwesomeIcon size={22} icon={faUpload} color="#0084FF" />
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <View style={tailwind('w-full h-full bg-gray-200 flex-grow')}>
            <View style={tailwind('flex flex-row ')}>
                <TouchableOpacity style={tailwind('p-2')} onPress={() => navigation.navigate('ChatsScreen')}>
                    <FontAwesomeIcon size={25} icon={faAngleLeft} style={tailwind('text-blue-500')} />
                </TouchableOpacity>
                <View style={tailwind('flex ml-2')}>
                    <TouchableOpacity style={tailwind('flex flex-col ml-2 mt-4')} onPress={() => navigation.navigate('ChannelScreen')}>
                        <Text>{data?.name}</Text>
                    </TouchableOpacity>
                </View>
                <View style={tailwind('flex flex-col items-center mr-4')}>
                    {users?.map(item => (
                        <TouchableOpacity size={22} icon={faUser} style={tailwind('text-blue-500')} key={item.id} onPress={() => addParticipant(item.id)}>
                            <Text style={tailwind('user-item')}>{user.name}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
            <View style={tailwind('flex-1 p-4')}>
                <GiftedChat
                    messages={messages}
                    onSend={messages => onSend(messages)}
                    user={{
                        _id: 1,
                    }}
                    renderBubble={renderBubble}
                    alwaysShowSend
                    scrollToBottom
                    renderInputToolbar={props => MessengerBarContainer(props)}
                    renderActions={renderActions}
                    scrollToBottomComponent={scrollToBottomComponent}
                    renderSend={renderSend}
                />
            </View>
        </View>
    );
};

export default ChatScreen;
