import { useNavigation } from '@react-navigation/native';
import { Text, YStack, XStack, useTheme } from 'tamagui';

const DriverDashboardScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();

    return (
        <YStack flex={1} bg='$background'>
            <YStack flex={1} padding='$4' gap='$4'>
                <YStack borderRadius='$6' bg='$surface' padding='$4'>
                    <Text color='$textPrimary'>Traffic Conditions</Text>
                </YStack>
                <XStack gap='$4'>
                    <YStack flex={1} borderRadius='$6' bg='$surface' padding='$4'>
                        <Text color='$textPrimary'>Active Orders</Text>
                    </YStack>
                    <YStack flex={1} borderRadius='$6' bg='$surface' padding='$4'>
                        <Text color='$textPrimary'>Current Order Progress</Text>
                    </YStack>
                </XStack>
                <YStack borderRadius='$6' bg='$surface' padding='$4'>
                    <Text color='$textPrimary'>Vehicle</Text>
                </YStack>
                <YStack borderRadius='$6' bg='$surface' padding='$4'>
                    <Text color='$textPrimary'>Quick Actions</Text>
                </YStack>
            </YStack>
        </YStack>
    );
};

export default DriverDashboardScreen;
