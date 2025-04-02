import { Text, YStack, Avatar } from 'tamagui';
import { Platform } from 'react-native';
import { abbreviateName } from '../utils';

const ChatParticipantAvatar = ({ participant, size = '$5' }) => {
    return (
        <YStack position='relative'>
            <Avatar circular size={size}>
                <Avatar.Image accessibilityLabel={participant.name} src={participant.avatar_url} />
                <Avatar.Fallback delayMs={800} backgroundColor='$primary' textAlign='center' alignItems='center' justifyContent='center'>
                    <Text fontSize='$8' fontWeight='bold' color='$white' textTransform='uppercase' textAlign='center'>
                        {abbreviateName(participant.name ?? participant.username)}
                    </Text>
                </Avatar.Fallback>
            </Avatar>
            {participant.is_online === true && (
                <YStack position='absolute' top={0} right={0} bg='$successBorder' width={12} height={12} borderRadius={Platform.OS === 'android' ? 12 : '100%'} />
            )}
        </YStack>
    );
};

export default ChatParticipantAvatar;
