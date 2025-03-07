import { useNavigation } from '@react-navigation/native';
import { Text, YStack, useTheme } from 'tamagui';

const DriverHomeScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();

    return (
        <YStack flex='$1' bg='$background'>
            <YStack alignItems='center' justifyContent='center'>
                <Text>DriverHomeScreen</Text>
            </YStack>
        </YStack>
    );
};

export default DriverHomeScreen;
