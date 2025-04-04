import { useImperativeHandle, useRef, forwardRef } from 'react';
import { FlatList } from 'react-native';
import { YStack, Text } from 'tamagui';
import { useAuth } from '../contexts/AuthContext';
import ChatMessage from './ChatMessage';
import ChatLog from './ChatLog';
import ChatAttachment from './ChatAttachment';

const ChatFeed = forwardRef(({ channel }, ref) => {
    const { driver } = useAuth();
    const participant = channel.participants.find((participant) => participant.user === driver.getAttribute('user'));
    const flatListRef = useRef(null);

    useImperativeHandle(ref, () => ({
        scrollToEnd: (options = { animated: true }) => {
            flatListRef.current?.scrollToEnd(options);
        },
        scrollToIndex: (options) => {
            flatListRef.current?.scrollToIndex(options);
        },
        getRef: () => flatListRef.current,
    }));

    const renderItem = ({ item }) => {
        return (
            <YStack mb='$2' px='$3' py='$2'>
                {(() => {
                    switch (item.type) {
                        case 'message':
                            return <ChatMessage record={item.data} participant={participant} />;
                        case 'log':
                            return <ChatLog record={item.data} participant={participant} />;
                        case 'attachment':
                            return <ChatAttachment record={item.data} participant={participant} />;
                        default:
                            return null;
                    }
                })()}
            </YStack>
        );
    };

    const scrollToBottom = () => {
        requestAnimationFrame(() => {
            flatListRef.current?.scrollToEnd({ animated: false });
        });
    };

    return (
        <FlatList
            ref={flatListRef}
            data={channel.feed}
            keyExtractor={(item, index) => item.data?.id ?? index}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={scrollToBottom}
        />
    );
});

export default ChatFeed;
