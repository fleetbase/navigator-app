import { Button, Avatar, YStack, XStack, Text, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { abbreviateName } from '../utils';
import { formatWhatsAppTimestamp } from '../utils/format';
import ChatAttachment from './ChatAttachment';

const ChatMessage = ({ record, participant }) => {
    const theme = useTheme();
    const isSender = participant.id === record.sender.id;

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
                    {record.sender.is_online === true && <YStack position='absolute' top={0} right={0} bg='$successBorder' width={12} height={12} borderRadius='100%' />}
                </YStack>
            </YStack>
            <YStack flex={1}>
                <XStack bg={isSender ? '$green-900' : '$gray-900'} borderRadius='$4' px='$2' py='$2' space='$3'>
                    <YStack flex={1}>
                        <Text color={isSender ? '$green-200' : '$blue-600'} mb='$2'>
                            {record.sender.name}
                        </Text>
                        <Text color='$textPrimary'>{record.content}</Text>
                        <XStack gap='$1' flexWrap='wrap'>
                            {record.attachments.map((attachment) => (
                                <ChatAttachment record={attachment} />
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
                        {record.receipts.map((receipt) => (
                            <XStack space='$1' alignItems='center'>
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
