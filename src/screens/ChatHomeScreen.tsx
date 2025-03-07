import { useNavigation } from '@react-navigation/native';
import { Text, YStack, useTheme } from 'tamagui';

const ChatHomeScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();

    return (
        <YStack flex='$1' bg='$background'>
            <YStack alignItems='center' justifyContent='center'>
                <Text>ChatHomeScreen</Text>
            </YStack>
        </YStack>
    );
};

export default ChatHomeScreen;
