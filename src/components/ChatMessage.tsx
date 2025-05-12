import { useEffect } from 'react';
import { Button, Avatar, YStack, XStack, Text, useTheme } from 'tamagui';
import { Platfrom } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { abbreviateName } from '../utils';
import { formatWhatsAppTimestamp } from '../utils/format';
import { useChat } from '../contexts/ChatContext';
import useAppTheme from '../hooks/use-app-theme';
import ChatAttachment from './ChatAttachment';

const ChatMessage = ({ record, participant }) => {
    const theme = useTheme();
    const { isDarkMode } = useAppTheme();
    const { createReadReceipt } = useChat();
    const isSender = participant.id === record.sender.id;
    const background = isDarkMode ? (isSender ? '$green-900' : '$gray-900') : isSender ? '$green-800' : '$gray-300';
    const messageTextColor = isDarkMode ? '$textPrimary' : isSender ? '$green-100' : '$gray-900';
    const senderTextColor = isDarkMode ? (isSender ? '$green-200' : '$blue-600') : isSender ? '$green-100' : '$gray-900';

    // Create read recipt if participant doesn't have
    useEffect(() => {
        const hasReadReceipt = record.receipts.find((chatReceipt) => chatReceipt.participant === participant.id);
        if (!hasReadReceipt) {
            createReadReceipt(record, participant);
        }
    }, []);

    return (
        <XStack>
            <YStack mr='$2'>
                <YStack position='relative'>
                    <Avatar circular size='$2'>
                        <Avatar.Image accessibilityLabel={record.sender.name} src={record.sender.avatar_url} />
                        <Avatar.Fallback delayMs={800} backgroundColor='$primary' textAlign='center' alignItems='center' justifyContent='center'>
                            <Text fontSize='$8' fontWeight='bold' color='$white' textTransform='uppercase' textAlign='center'>
                                {abbreviateName(record.sender.name)}
                            </Text>
                        </Avatar.Fallback>
                    </Avatar>
                    {record.sender.is_online === true && (
                        <YStack position='absolute' top={0} right={0} bg='$successBorder' width={12} height={12} borderRadius={Platform.OS === 'android' ? 12 : '100%'} />
                    )}
                </YStack>
            </YStack>
            <YStack flex={1}>
                <XStack bg={background} borderRadius='$4' px='$2' py='$2' space='$3'>
                    <YStack flex={1}>
                        <Text color={senderTextColor} fontWeight='bold' mb='$2'>
                            {record.sender.name}
                        </Text>
                        <Text color={messageTextColor}>{record.content}</Text>
                        <XStack gap='$1' flexWrap='wrap'>
                            {record.attachments.map((attachment, index) => (
                                <ChatAttachment key={index} record={attachment} />
                            ))}
                        </XStack>
                    </YStack>
                </XStack>
                <XStack px='$2' pt='$2' alignItems='center' justifyContent='space-between'>
                    <YStack flex={1}>
                        <Text color='$textSecondary' fontSize={10}>
                            {record.id === 'temp' ? 'Sending...' : formatWhatsAppTimestamp(new Date(record.created_at))}
                        </Text>
                    </YStack>
                    <XStack flex={1} justifyContent='flex-end' space='$1'>
                        {record.receipts.map((receipt, index) => (
                            <XStack key={index} space='$1' alignItems='center'>
                                <FontAwesomeIcon icon={faCheck} color={theme['$green-500'].val} size={10} />
                                <Text color='$textSecondary' fontSize={10}>
                                    {receipt.participant_name}
                                </Text>
                            </XStack>
                        ))}
                    </XStack>
                </XStack>
            </YStack>
        </XStack>
    );
};

export default ChatMessage;
