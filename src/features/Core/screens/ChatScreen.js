import { faAngleLeft, faEdit, faPaperPlane, faUpload, faUser, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useNavigation } from '@react-navigation/native';
import { useFleetbase } from 'hooks';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Text, TouchableOpacity, View } from 'react-native';
import { Actions, Bubble, GiftedChat, InputToolbar, Send } from 'react-native-gifted-chat';
import { launchImageLibrary } from 'react-native-image-picker';
import { tailwind } from 'tailwind';

const ChatScreen = ({ route }) => {
    const { data, itemData } = route.params;
    const fleetbase = useFleetbase();
    const navigation = useNavigation();
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState();
    const [users, setUsers] = useState([]);
    const [channel, setChannel] = useState([]);
    const [showUserList, setShowUserList] = useState(false);
    const [addedParticipants, setAddedParticipants] = useState([]);

    useEffect(() => {
        fetchUsers(itemData?.id);
        fetchChannels();
    }, []);

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

    const addChannelCreationMessage = () => {
        const newMessage = {
            _id: new Date().getTime(), // Use current timestamp as a unique ID
            text: 'Channel created successfully',
            createdAt: new Date(),
            user: {
                _id: 1,
                name: 'System',
            },
        };
        setMessages(previousMessages => GiftedChat.append(previousMessages, [newMessage]));
    };

    const fetchChannels = async () => {
        try {
            const adapter = fleetbase.getAdapter();
            const response = await adapter.get('chat-channels');
            setChannel(response);
            addChannelCreationMessage();
        } catch (error) {
            console.error('Error fetching channels:', error);
        }
    };

    const toggleUserList = () => {
        setShowUserList(!showUserList);
    };

    const fetchUsers = async id => {
        try {
            const adapter = fleetbase.getAdapter();
            const response = await adapter.get(`chat-channels/${id}/available-participants`);
            setUsers(response);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    };

    const addParticipant = async (channelId, participantId, participantName, avatar) => {
        try {
            const adapter = fleetbase.getAdapter();
            const res = await adapter.post(`chat-channels/${channelId}/add-participant`, { user: participantId });

            setAddedParticipants(prevParticipants => [
                ...prevParticipants,
                {
                    id: participantId,
                    name: participantName,
                    avatar: avatar,
                },
            ]);
            const newMessage = {
                _id: new Date().getTime(),
                text: `Added ${participantName} to this channel`,
                createdAt: new Date(),
                user: {
                    _id: 1,
                    name: 'System',
                },
            };

            setMessages(previousMessages => GiftedChat.append(previousMessages, [newMessage]));

            setShowUserList(false);
        } catch (error) {
            console.error('Add participant:', error);
        }
    };

    const deleteParticipant = async participantId => {
        try {
            const adapter = fleetbase.getAdapter();
            await adapter.delete(`chat-channels/remove-participant/${participantId}`);

            setAddedParticipants(prevParticipants => prevParticipants.filter(participant => participant.id !== participantId));

            const newMessage = {
                _id: new Date().getTime(),
                text: `Removed participant from this channel`,
                createdAt: new Date(),
                user: {
                    _id: 1,
                    name: 'System',
                },
            };
            setMessages(previousMessages => GiftedChat.append(previousMessages, [newMessage]));
        } catch (error) {
            console.error('Remove participant:', error);
        }
    };

    const AddedParticipants = ({ participants, onDelete }) => {
        return (
            <View style={tailwind('flex flex-row items-center p-2')}>
                {participants.map(participant => (
                    <View key={participant.id} style={tailwind('flex flex-col items-center mr-2')}>
                        <View style={tailwind('relative')}>
                            <View
                                style={[
                                    tailwind(participant.status === 'active' ? 'bg-green-500 w-4 h-4 rounded-full absolute left-0' : 'bg-yellow-500 w-3 h-3 rounded-full absolute left-0'),
                                    {
                                        zIndex: 2,
                                        marginTop: -2,
                                        left: -2,
                                    },
                                ]}
                            />
                            <Image source={{ uri: participant.avatar }} style={tailwind('w-10 h-10 rounded-full')} />
                            <TouchableOpacity
                                style={[
                                    tailwind('absolute right-0'),
                                    {
                                        zIndex: 3,
                                        marginTop: -4,
                                        right: -4,
                                    },
                                ]}
                                onPress={() => removeParticipant(participant.id)}>
                                <FontAwesomeIcon icon={faTrash} size={14} color="#FF0000" />
                            </TouchableOpacity>
                        </View>
                        <Text style={tailwind('text-sm text-gray-300')}>{participant.name}</Text>
                    </View>
                ))}
            </View>
        );
    };

    const removeParticipant = async participantId => {
        try {
            const adapter = fleetbase.getAdapter();
            const res = await adapter.delete(`chat-channels/remove-participant/${participantId}`);
        } catch (error) {
            console.error('Remove participant:', error);
        }
    };

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
                        backgroundColor: '#919498',
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

    const uploadFile = async file => {
        const formData = new FormData();
        formData.append('file', {
            uri: file.uri,
            name: file.name,
            type: file.type,
        });

        //todo
    };

    const chooseFile = () => {
        const options = {
            title: 'Select File',
            storageOptions: {
                skipBackup: true,
                path: 'images',
            },
        };

        launchImageLibrary(options, response => {
            if (response.didCancel) {
                console.log('User cancelled image picker');
            } else if (response.error) {
                console.log('ImagePicker Error: ', response.error);
            } else {
                const file = {
                    uri: response.uri,
                    name: response.fileName,
                    type: response.type,
                };
                uploadFile(file);
            }
        });
    };

    const renderActions = () => (
        <Actions
            options={{
                'Choose From Library': () => {
                    chooseFile();
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
        <View style={tailwind('w-full h-full bg-gray-800')}>
            <View style={tailwind('flex flex-row')}>
                <View style={tailwind('flex flex-row items-center')}>
                    <TouchableOpacity style={tailwind('p-2')} onPress={() => navigation.goBack()}>
                        <FontAwesomeIcon size={25} icon={faAngleLeft} style={tailwind('text-gray-300')} />
                    </TouchableOpacity>
                    <View style={tailwind('flex flex-row items-center')}>
                        <Text style={tailwind('text-sm text-gray-300 w-72 text-center')}>
                            {itemData?.name || data.name}
                            {'  '}
                            <TouchableOpacity style={tailwind('rounded-full')} onPress={() => navigation.navigate('ChannelScreen', { data: itemData })}>
                                <FontAwesomeIcon size={18} icon={faEdit} style={tailwind('text-gray-300 mt-1')} />
                            </TouchableOpacity>
                        </Text>
                    </View>

                    <View style={tailwind('flex flex-col items-center left-6')}>
                        <TouchableOpacity style={tailwind('rounded-full')} onPress={toggleUserList}>
                            <FontAwesomeIcon size={15} icon={faUser} style={tailwind('text-gray-300')} />
                        </TouchableOpacity>
                    </View>
                </View>

                {showUserList && (
                    <View style={tailwind('flex-1 justify-center items-center inset-0 top-14')}>
                        <View style={tailwind('bg-gray-500 w-60 h-40 rounded-lg shadow-lg p-4 right-40')}>
                            <FlatList
                                data={users}
                                keyExtractor={item => item.id.toString()}
                                renderItem={({ item }) => (
                                    <TouchableOpacity onPress={() => addParticipant(itemData.id, item.id, item.name, item.avatar_url)} style={tailwind('flex flex-row items-center py-2')}>
                                        <View style={tailwind(item.status === 'active' ? 'bg-green-500 w-2 h-2 rounded-full mr-2' : 'bg-yellow-500 w-2 h-2 rounded-full mr-2')} />
                                        <FontAwesomeIcon icon={faUser} size={15} color="#fff" style={tailwind('mr-2')} />
                                        <Text style={tailwind('text-sm')}>{item.name}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </View>
                    </View>
                )}
            </View>
            <View style={tailwind('flex-1 p-4')}>
                <AddedParticipants participants={addedParticipants} onDelete={deleteParticipant} />

                <GiftedChat
                    messages={messages}
                    onSend={onSend}
                    user={{
                        _id: 1,
                    }}
                    renderBubble={renderBubble}
                    alwaysShowSend
                    scrollToBottom
                    renderInputToolbar={MessengerBarContainer}
                    renderActions={renderActions}
                    scrollToBottomComponent={scrollToBottomComponent}
                    renderSend={renderSend}
                />
            </View>
        </View>
    );
};

export default ChatScreen;
