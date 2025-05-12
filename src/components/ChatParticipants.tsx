import React from 'react';
import { Pressable } from 'react-native';
import { Avatar, XStack, YStack, Text, useTheme } from 'tamagui';
import useAppTheme from '../hooks/use-app-theme';

export const ChatParticipants = ({ participants = [], size = 30, onPress }) => {
    const { isDarkMode } = useAppTheme();

    // Display a friendly message when no participants exist
    if (participants.length === 0) {
        return (
            <XStack alignItems='center'>
                <Text color='$textPrimary'>No participants</Text>
            </XStack>
        );
    }

    const maxAvatars = 4;
    const displayParticipants = participants.slice(0, maxAvatars);
    const extraCount = participants.length - maxAvatars;
    const hasExtra = extraCount > 0;
    // Overlap factor can be adjusted as needed; here we use 30% of the size.
    const overlapMargin = size * 0.3;

    const shadowStyle = {
        shadowColor: 'rgba(0, 0, 0, 0.25)',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
    };

    return (
        <Pressable onPress={onPress}>
            <XStack alignItems='center'>
                {displayParticipants.map((participant, index) => (
                    <YStack key={participant.id} ml={index === 0 ? 0 : -overlapMargin} width={size}>
                        <Avatar circular size={size} borderWidth={1} borderColor={isDarkMode ? '$gray-900' : '$borderColorWithShadow'} style={shadowStyle}>
                            <Avatar.Image accessibilityLabel={participant.name} src={participant.avatar_url} />
                            <Avatar.Fallback backgroundColor='$blue-500' />
                        </Avatar>
                        <YStack
                            ml={(size / 2) * -1}
                            opacity={0.75}
                            textAlign='center'
                            mt='$1'
                            bg={isDarkMode ? '$black' : '$gray-200'}
                            borderWidth={1}
                            borderColor={isDarkMode ? '$borderColor' : '$borderColorWithShadow'}
                            borderRadius='$6'
                            px='$2'
                            py='$1'
                            width={size * 2}
                        >
                            <Text numberOfLines={1} color='$textSecondary' fontSize={8}>
                                {participant.name}
                            </Text>
                        </YStack>
                    </YStack>
                ))}
                {hasExtra && (
                    <Avatar mt={-16} circular size={size} bg='$info' borderWidth={1} borderColor='$infoBorder' ml={-overlapMargin} alignItems='center' justifyContent='center'>
                        <Text color='white' fontSize={size * 0.4} fontWeight='bold'>
                            +{extraCount}
                        </Text>
                    </Avatar>
                )}
            </XStack>
        </Pressable>
    );
};

export default ChatParticipants;
