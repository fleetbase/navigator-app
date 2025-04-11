import { useRef, useEffect, useCallback, useState } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, Pressable, Keyboard } from 'react-native';
import { Text, YStack, XStack, Button, Avatar, Separator, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPlus, faChevronLeft } from '@fortawesome/free-solid-svg-icons';
import { last, abbreviateName, later } from '../utils';
import { formatWhatsAppTimestamp } from '../utils/format';
import { useChat } from '../contexts/ChatContext';
import { useAuth } from '../contexts/AuthContext';
import useSocketClusterClient from '../hooks/use-socket-cluster-client';
import ChatFeed from '../components/ChatFeed';
import ChatKeyboard from '../components/ChatKeyboard';
import ChatParticipants from '../components/ChatParticipants';

const ChatChannelScreen = ({ route }) => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { currentChannel: channel, setCurrentChannel: setChannel, sendMessage, reloadCurrentChannel, getChannelCurrentParticipant } = useChat();
    const { listen } = useSocketClusterClient();
    const chatFeedRef = useRef();
    const listenerRef = useRef();
    const channelReloadedRef = useRef(false);

    const addFeedItem = useCallback((item, type = 'message') => {
        setChannel((prevChannel) => {
            const existsInFeed = prevChannel.feed.some((feedItem) => feedItem.data.id === item.id);
            if (existsInFeed) return prevChannel;

            return {
                ...prevChannel,
                feed: [
                    ...prevChannel.feed.filter((feedItem) => feedItem.data.id !== 'temp'),
                    {
                        type,
                        data: item,
                        created_at: new Date(),
                    },
                ],
            };
        });
        scrollToBottom(0);
    }, []);

    const addFeedTempItem = useCallback((item, type = 'message') => {
        setChannel((prevChannel) => {
            const existsInFeed = prevChannel.feed.some((feedItem) => feedItem.data.id === item.id);
            if (existsInFeed) return prevChannel;

            return {
                ...prevChannel,
                feed: [
                    ...prevChannel.feed,
                    {
                        type,
                        data: item,
                        created_at: new Date(),
                    },
                ],
            };
        });
        scrollToBottom(0);
    }, []);

    const handleExitChatChannel = () => {
        navigation.goBack();
    };

    const scrollToBottom = (delay = 100) => {
        later(() => {
            if (chatFeedRef.current) {
                chatFeedRef.current.scrollToEnd();
            }
        }, delay);
    };

    const handleSendMessage = async (message) => {
        addFeedTempItem({
            id: 'temp',
            sender: getChannelCurrentParticipant(channel),
            content: message,
            receipts: [],
            attachments: [],
            created_at: new Date(),
            updated_at: new Date(),
        });

        try {
            const newMessage = await sendMessage(channel, message);
            addFeedItem(newMessage);
            await reloadChannel();
        } catch (error) {
            console.warn('Error sending message:', error);
        }
    };

    const reloadChannel = async () => {
        try {
            const reloadedChannel = await reloadCurrentChannel();
            scrollToBottom(0);
        } catch (error) {
            console.warn('Error reloading channel:', error);
        }
    };

    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
            // Adjust the delay as needed
            later(() => {
                if (chatFeedRef.current) {
                    chatFeedRef.current.scrollToEnd();
                }
            }, 150);
        });

        return () => {
            keyboardDidShowListener.remove();
        };
    }, []);

    useFocusEffect(
        useCallback(() => {
            const listenForEvents = async () => {
                // Stop previous listener if it exists
                if (listenerRef.current) {
                    listenerRef.current.stop();
                    listenerRef.current = null;
                }

                const listener = await listen(`chat.${channel.id}`, (socketEvent) => {
                    console.log('[ChatChannelScreen #socketEvent]', socketEvent);
                    switch (socketEvent.event) {
                        case 'chat_message.created':
                        case 'chat.added_participant':
                        case 'chat_channel.created':
                        case 'chat_receipt.created':
                        case 'chat_participant.deleted':
                        case 'chat.removed_participant':
                        case 'chat_channel.deleted':
                            reloadChannel();
                            break;
                    }
                });

                if (listener) {
                    listenerRef.current = listener;
                }
            };

            // Reload channel on focus
            if (channelReloadedRef && channelReloadedRef.current === false) {
                reloadChannel();
                channelReloadedRef.current = true;
            }

            listenForEvents();

            return () => {
                if (listenerRef.current) {
                    listenerRef.current.stop();
                    listenerRef.current = null;
                }
            };
        }, [channel.id])
    );

    return (
        <YStack flex={1} bg='$surface'>
            <XStack bg='$background' alignItems='center' justifyContent='space-between' borderBottomWidth={1} borderColor='$borderColor' px='$3' py='$4' width='100%'>
                <XStack flex={1} alignItems='center'>
                    <YStack mr='$3'>
                        <Button onPress={handleExitChatChannel} bg='$surface' size='$3' circular>
                            <Button.Icon>
                                <FontAwesomeIcon icon={faChevronLeft} color={theme.textPrimary.val} size={16} />
                            </Button.Icon>
                        </Button>
                    </YStack>
                    <YStack flex={1}>
                        <Text fontSize={16} color='$textPrimary' fontWeight='bold' numberOfLines={1}>
                            {channel.title}
                        </Text>
                    </YStack>
                </XStack>
                <YStack pr='$2'>
                    <ChatParticipants participants={channel.participants} onPress={() => navigation.navigate('ChatParticipants', { channel })} />
                </YStack>
            </XStack>
            <ChatFeed ref={chatFeedRef} channel={channel} />
            <ChatKeyboard channel={channel} onSend={handleSendMessage} />
        </YStack>
    );
};

export default ChatChannelScreen;
