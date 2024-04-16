import { faAngleLeft, faPaperPlane, faUpload, faUser, faEdit } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useNavigation } from '@react-navigation/native';
import { useFleetbase } from 'hooks';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
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
    const [showUserList, setShowUserList] = useState(false);

    const fetchUsers = async () => {
        try {
            const adapter = getUser.getAdapter();
            const response = await adapter.get('users');
            console.log('user::::', JSON.stringify(response.users));
            setUsers(response.users);
            return response;
        } catch (error) {
            console.error('Error fetching users:', error);
            return [];
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const toggleUserList = () => {
        setShowUserList(!showUserList); // Toggle the user list visibility
    };

    const addParticipant = async id => {
        try {
            // const adapter = fleetbase.getAdapter();
            // const res = await adapter.post(`chat-channels/${id}/add-participant`);
            // console.log('res:::', JSON.stringify(res));
            setShowUserList(false);
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
        <View style={tailwind('w-full h-full bg-gray-200')}>
            <View style={tailwind('flex flex-row ')}>
                <View style={tailwind('flex flex-row items-center')}>
                    <TouchableOpacity style={tailwind('p-2')} onPress={() => navigation.goBack()}>
                        <FontAwesomeIcon size={25} icon={faAngleLeft} style={tailwind('text-blue-500')} />
                    </TouchableOpacity>
                    <View style={tailwind('flex flex-row items-center')}>
                        <Text style={tailwind('text-sm text-gray-600 w-72 text-center')}>
                            {'name '}
                            <TouchableOpacity style={tailwind('rounded-full')} onPress={() => navigation.navigate('ChannelScreen')}>
                                <FontAwesomeIcon size={15} icon={faEdit} style={tailwind('text-blue-500')} />
                            </TouchableOpacity>
                        </Text>
                    </View>

                    <View style={tailwind('flex flex-col items-center left-6')}>
                        <TouchableOpacity style={tailwind('rounded-full')} onPress={toggleUserList}>
                            <FontAwesomeIcon size={15} icon={faUser} style={tailwind('text-blue-500')} />
                        </TouchableOpacity>
                    </View>
                </View>

                {showUserList && (
                    <View style={tailwind('flex-1 justify-center items-center inset-0 top-14')}>
                        <View style={tailwind('bg-white w-60 h-40 rounded-lg shadow-lg p-4 right-40')}>
                            <FlatList
                                data={users}
                                keyExtractor={item => item.id.toString()}
                                renderItem={({ item }) => (
                                    <View style={tailwind('flex flex-row items-center py-2')}>
                                        <TouchableOpacity onPress={() => addParticipant(item.id)} style={tailwind('flex flex-row items-center')}>
                                            <View style={tailwind(item.status === 'active' ? 'bg-green-500 w-2 h-2 rounded-full mr-2' : 'bg-yellow-500 w-2 h-2 rounded-full mr-2')} />
                                            <FontAwesomeIcon icon={faUser} size={15} color="#168AFF" style={tailwind('mr-2')} />
                                            <Text style={tailwind('text-sm')}>{item.name}</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            />
                        </View>
                    </View>
                )}
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
