import { useNavigation } from '@react-navigation/native';
import { Text, YStack, useTheme } from 'tamagui';

const EntityScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();

    return (
        <YStack flex='$1' bg='$background'>
            <YStack alignItems='center' justifyContent='center'>
                <Text>EntityScreen</Text>
            </YStack>
        </YStack>
    );
};

export default EntityScreen;
