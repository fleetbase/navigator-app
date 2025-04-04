import { YStack, Text } from 'tamagui';

const ChatLog = ({ record }) => {
    return (
        <YStack>
            <YStack textAlign='center' alignItems='center' justifyContent='center' px='$3' py='$2' borderWidth={1} borderColor='$borderColorWithShadow' borderRadius='$5'>
                <Text color='$textPrimary' fontSize={12} numberOfLines={2} textAlign='center'>
                    {record.resolved_content}
                </Text>
            </YStack>
        </YStack>
    );
};

export default ChatLog;
