import { faAngleLeft, faPaperPlane, faUpload, faUser, faEdit } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useNavigation } from '@react-navigation/native';
import { useFleetbase } from 'hooks';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { Actions, Bubble, GiftedChat, InputToolbar, Send } from 'react-native-gifted-chat';
import { tailwind } from 'tailwind';

const ChatScreen = ({ route }) => {
    const { data, itemData } = route.params;
    const fleetbase = useFleetbase();
    const getUser = useFleetbase('int/v1');
    const navigation = useNavigation();
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState();
    const [users, setUsers] = useState([]);
    const [channel, setChannel] = useState([]);
    const [showUserList, setShowUserList] = useState(false);

    const fetchUsers = async () => {
        try {
            const adapter = getUser.getAdapter();
            const response = await adapter.get('users');
            setUsers(response.users);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    };

    const fetchChannels = async () => {
        try {
            const adapter = fleetbase.getAdapter();
            const response = await adapter.get('chat-channels');
            setChannel(response);
        } catch (error) {
            console.error('Error fetching channels:', error);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchChannels();
    }, []);

    const toggleUserList = () => {
        setShowUserList(!showUserList);
    };

    const addParticipant = async participantId => {
        try {
            const adapter = fleetbase.getAdapter();
            const res = await adapter.post(`chat-channels/${participantId}/add-participant`);
            setShowUserList(false);
        } catch (error) {
            console.error('Add participant:', error);
        }
    };

    const removeParticipant = async participantId => {
        try {
            const adapter = fleetbase.getAdapter();
            const res = await adapter.delete(`chat-channels/remove-participant/${participantId}`);
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
                                    <TouchableOpacity onPress={() => addParticipant(item.id)} style={tailwind('flex flex-row items-center py-2')}>
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
