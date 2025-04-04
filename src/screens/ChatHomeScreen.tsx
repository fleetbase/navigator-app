import { useRef, useEffect, useCallback } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, Pressable, Platform } from 'react-native';
import { Text, YStack, XStack, Button, Avatar, Separator, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { last } from '../utils';
import { formatWhatsAppTimestamp } from '../utils/format';
import { useChat } from '../contexts/ChatContext';
import { useAuth } from '../contexts/AuthContext';
import useSocketClusterClient from '../hooks/use-socket-cluster-client';
import ChatParticipantAvatar from '../components/ChatParticipantAvatar';

const ChatHomeScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { channels, getChannels, setCurrentChannel, isLoading } = useChat();
    const { driver } = useAuth();
    const { listen } = useSocketClusterClient();
    const listenerRef = useRef({});
    const loadedRef = useRef(false);

    const handleOpenChannel = (channel) => {
        setCurrentChannel(channel);
        navigation.navigate('ChatChannel', { channel });
    };

    const renderChannel = ({ item: channel }) => {
        const lastParticipant = last(channel.participants);
        const otherParticipant = channel.participants.find((participant) => participant.user !== driver.getAttribute('user')) ?? lastParticipant;
        const lastMessageReceived = channel.last_message ? channel.last_message.created_at : channel.created_at;
        let lastMessageContent = 'No messages';

        if (channel.last_message?.content) {
            if (channel.participants.length > 2) {
                const senderName = channel.last_message.sender?.name;
                lastMessageContent = senderName ? `${senderName}: ${channel.last_message.content}` : channel.last_message.content;
            } else {
                lastMessageContent = channel.last_message.content;
            }
        }

        return (
            <Pressable onPress={() => handleOpenChannel(channel)}>
                <XStack bg='$background' px='$4' py='$3'>
                    <YStack>
                        <ChatParticipantAvatar participant={otherParticipant} />
                    </YStack>
                    <YStack flex={1} px='$3'>
                        <Text fontSize={16} color='$textPrimary' fontWeight='bold' numberOfLines={1} mb='$1'>
                            {channel.title}
                        </Text>
                        <Text fontSize={13} color='$textSecondary' numberOfLines={2}>
                            {lastMessageContent}
                        </Text>
                    </YStack>
                    <YStack alignItems='flex-end'>
                        <Text fontSize={13} color={channel.unread_count > 0 ? '$successBorder' : '$textSecondary'} numberOfLines={2}>
                            {formatWhatsAppTimestamp(new Date(lastMessageReceived))}
                        </Text>
                        {channel.unread_count > 0 && (
                            <YStack
                                mt='$2'
                                bg='$successBorder'
                                width={20}
                                height={20}
                                borderRadius={Platform.OS === 'android' ? 20 : '100%'}
                                alignItems='center'
                                justifyContent='center'
                                textAlign='center'
                            >
                                <Text color='$successText'>{channel.unread_count}</Text>
                            </YStack>
                        )}
                    </YStack>
                </XStack>
            </Pressable>
        );
    };

    useFocusEffect(
        useCallback(() => {
            const listenForEvents = async (channelName, callback) => {
                if (listenerRef.current && listenerRef.current[channelName]) return;

                const listener = await listen(channelName, callback);
                if (listener) {
                    listenerRef.current[channelName] = listener;
                }
            };

            const stopListening = (channelName) => {
                if (listenerRef.current && listenerRef.current[channelName]) {
                    listenerRef.current[channelName].stop();
                    delete listenerRef.current[channelName];
                }
            };

            if (loadedRef && loadedRef.current === false) {
                getChannels();
                loadedRef.current = true;
            }

            listenForEvents(`user.${driver.getAttribute('user')}`, (socketEvent) => {
                switch (socketEvent.event) {
                    case 'chat.participant_added':
                    case 'chat_participant.created':
                    case 'chat_channel.created':
                        getChannels();
                        break;
                    case 'chat_channel.deleted':
                    case 'chat.participant_removed':
                    case 'chat_participant.deleted':
                        getChannels();
                        stopListening(`user.${driver.getAttribute('user')}`);
                        break;
                }
            });

            channels.forEach((channel) => {
                const channelName = `chat.${channel.id}`;
                listenForEvents(channelName, (socketEvent) => {
                    switch (socketEvent.event) {
                        case 'chat_message.created':
                        case 'chat.added_participant':
                        case 'chat_channel.created':
                        case 'chat_receipt.created':
                            getChannels();
                            break;
                        case 'chat_participant.deleted':
                        case 'chat.removed_participant':
                        case 'chat_channel.deleted':
                            getChannels();
                            stopListening(channelName);
                            break;
                    }
                });
            });

            return () => {
                if (listenerRef.current) {
                    for (let channelName in listenerRef.current) {
                        stopListening(channelName);
                    }
                }
            };
        }, [listen, channels, driver])
    );

    return (
        <YStack flex={1} bg='$surface' borderTopWidth={0} borderColor='$borderColor'>
            <XStack bg='$background' alignItems='center' justifyContent='space-between' px='$3' py='$4' borderBottomWidth={1} borderColor='$borderColor'>
                <YStack>
                    <Text color='$textPrimary' fontSize={26} fontWeight='bold'>
                        Chats
                    </Text>
                </YStack>
                <YStack>
                    <Button onPress={() => navigation.navigate('CreateChatChannel')} circular size='$3' bg='$success' borderWidth={1} borderColor='$successBorder'>
                        <Button.Icon>
                            <FontAwesomeIcon icon={faPlus} color={theme['$successText'].val} />
                        </Button.Icon>
                    </Button>
                </YStack>
            </XStack>
            <FlatList
                data={channels}
                refreshControl={<RefreshControl refreshing={isLoading} onRefresh={getChannels} tintColor={theme.textPrimary.val} />}
                keyExtractor={(item) => item.id}
                renderItem={renderChannel}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                ItemSeparatorComponent={() => <Separator borderBottomWidth={1} borderColor='$borderColor' />}
            />
        </YStack>
    );
};

export default ChatHomeScreen;
