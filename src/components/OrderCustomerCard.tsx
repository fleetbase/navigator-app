import { YStack, XStack, Text, Avatar, Separator, Button, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPhone, faEnvelope, faMessage } from '@fortawesome/free-solid-svg-icons';
import FastImage from 'react-native-fast-image';
import { useNavigation } from '@react-navigation/native';
import { useChat } from '../contexts/ChatContext';
import { isStorefrontOrder } from '../utils/chat';
import { toast } from '../utils/toast';
import usePromiseWithLoading from '../hooks/use-promise-with-loading';

// The chat tab can be removed through navigator config, so look for it before offering chat
function canNavigateToChat(navigation) {
    let current = navigation;
    while (current) {
        if (current.getState?.()?.routeNames?.includes('DriverChatTab')) {
            return true;
        }
        current = current.getParent?.();
    }
    return false;
}

const OrderCustomerCard = ({ customer, order = null }) => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { getOrderChannel, setCurrentChannel } = useChat();
    const { runWithLoading, isLoading } = usePromiseWithLoading();
    const isChatAvailable = isStorefrontOrder(order) && canNavigateToChat(navigation);

    const handleChat = async () => {
        try {
            const channel = await runWithLoading(getOrderChannel(order));
            if (!channel) {
                toast.info('Chat with this customer is not available for this order yet.');
                return;
            }

            setCurrentChannel(channel);
            navigation.navigate('DriverChatTab', { screen: 'ChatChannel', params: { channel }, initial: false });
        } catch (err) {
            console.warn('Error opening order chat channel:', err);
            toast.error('Unable to open chat for this order.');
        }
    };

    return (
        <YStack space='$2' borderWidth={1} borderColor='$borderColor' borderRadius='$4'>
            <YStack px='$3' py='$2'>
                <XStack space='$3'>
                    <YStack justifyContent='center'>
                        <Avatar size={30} circular>
                            <Avatar.Image src={customer.photo_url} />
                        </Avatar>
                    </YStack>
                    <YStack>
                        <Text color='$textPrimary' fontWeight='bold' mb='$1'>
                            {customer.name}
                        </Text>
                        <YStack>
                            {customer.phone && <Text color='$textSecondary'>{customer.phone}</Text>}
                            {customer.email && <Text color='$textSecondary'>{customer.email}</Text>}
                        </YStack>
                    </YStack>
                </XStack>
            </YStack>
            <Separator />
            <YStack px='$3' py='$2'>
                <XStack space='$3'>
                    <Button bg='$info' size='$3' borderWidth={1} borderColor='$infoBorder'>
                        <Button.Icon>
                            <FontAwesomeIcon icon={faPhone} color={theme.infoText.val} />
                        </Button.Icon>
                        <Button.Text color='$infoText'>Call</Button.Text>
                    </Button>
                    <Button bg='$info' size='$3' borderWidth={1} borderColor='$infoBorder'>
                        <Button.Icon>
                            <FontAwesomeIcon icon={faEnvelope} color={theme.infoText.val} />
                        </Button.Icon>
                        <Button.Text color='$infoText'>Email</Button.Text>
                    </Button>
                    {isChatAvailable && (
                        <Button onPress={handleChat} disabled={isLoading()} opacity={isLoading() ? 0.6 : 1} bg='$info' size='$3' borderWidth={1} borderColor='$infoBorder'>
                            <Button.Icon>
                                <FontAwesomeIcon icon={faMessage} color={theme.infoText.val} />
                            </Button.Icon>
                            <Button.Text color='$infoText'>Chat</Button.Text>
                        </Button>
                    )}
                </XStack>
            </YStack>
        </YStack>
    );
};

export default OrderCustomerCard;
