import React from 'react';
import { Linking } from 'react-native';
import { Modal } from 'react-native';
import { YStack, XStack, Text, Button, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import WaypointList from './WaypointList';

interface DestinationChangedAlertProps {
    visible: boolean;
    previousDestination: { getAttribute: (key: string) => string };
    currentDestination: { getAttribute: (key: string) => string };
    waypoints: any[];
    onClose: () => void;
}

const DestinationChangedAlert: React.FC<DestinationChangedAlertProps> = ({ visible, previousDestination, currentDestination, onClose }) => {
    const theme = useTheme();
    const prevAddress = previousDestination?.getAttribute('address');
    const currAddress = currentDestination?.getAttribute('address');

    return (
        <Modal transparent visible={visible} animationType='fade'>
            <YStack fullscreen backgroundColor='rgba(0,0,0,0.5)' alignItems='center' justifyContent='center'>
                <YStack width='90%' maxWidth={400} borderRadius='$4' borderWidth={1} borderColor='$infoBorder' backgroundColor='$background'>
                    <YStack>
                        <XStack space='$2' px='$4' py='$4' alignItems='center' borderBottomWidth={1} borderColor='$infoBorder'>
                            <FontAwesomeIcon icon={faCheck} color={theme['$green-500'].val} />
                            <Text fontSize='$6' fontWeight='bold' color='$textPrimary'>
                                Waypoint Completed
                            </Text>
                        </XStack>
                        <YStack py='$2'>
                            <YStack mt='$3' space='$2' px='$4'>
                                <Text fontSize='$4' color='$textSecondary'>
                                    Activity for waypoint <Text color='$infoText'>{prevAddress}</Text> is complete.
                                </Text>
                                <Text fontSize='$4' color='$textSecondary'>
                                    Your current destination has changed to <Text color='$infoText'>{currAddress}</Text>.
                                </Text>
                            </YStack>
                            <YStack mt='$5' px='$4'>
                                <WaypointList waypoints={[previousDestination, currentDestination].filter(Boolean)} highlight={2} onCall={(phone) => Linking.openURL(`tel:${phone}`)} />
                            </YStack>
                        </YStack>
                    </YStack>

                    <YStack mt='$4' borderTopWidth={1} borderColor='$infoBorder' alignItems='center' justifyContent='center'>
                        <Button onPress={onClose} width='100%' height='$5'>
                            <Button.Text fontSize='$5' fontWeight='bold'>
                                Continue
                            </Button.Text>
                        </Button>
                    </YStack>
                </YStack>
            </YStack>
        </Modal>
    );
};

export default DestinationChangedAlert;
