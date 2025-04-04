import { useRef, useEffect, useCallback, useState, useMemo, memo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { FlatList, TouchableWithoutFeedback, KeyboardAvoidingView, Keyboard, Platform, Alert } from 'react-native';
import { Text, Input, YStack, XStack, Button, Avatar, Separator, Spinner, useTheme } from 'tamagui';
import { PortalHost } from '@gorhom/portal';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPlus, faTimes, faCheck, faChevronLeft, faSave } from '@fortawesome/free-solid-svg-icons';
import { last, abbreviateName, later } from '../utils';
import { formatWhatsAppTimestamp } from '../utils/format';
import { toast } from '../utils/toast';
import { useChat } from '../contexts/ChatContext';
import { useAuth } from '../contexts/AuthContext';
import useSocketClusterClient from '../hooks/use-socket-cluster-client';
import ChatParticipantAvatar from '../components/ChatParticipantAvatar';
import Spacer from '../components/Spacer';

const CreateChatChannelScreen = ({ route }) => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { driver } = useAuth();
    const { createChannel, getAvailableParticipants } = useChat();
    const { listen } = useSocketClusterClient();
    const [availableParticipants, setAvailableParticipants] = useState([]);
    const [selectedParticipants, setSelectedParticipants] = useState([]);
    const [channelName, setChannelName] = useState('');
    const [isLoading, setIsLoading] = useState('');
    const availableParticipantsLoadedRef = useRef(false);

    const handleSelectParticipant = (participant) => {
        setSelectedParticipants((prevSelected) => [...prevSelected, participant.id]);
    };

    const handleUnselectParticipant = (participant) => {
        setSelectedParticipants((prevSelected) => prevSelected.filter((selected) => selected !== participant.id));
    };

    const handleCreateChat = useCallback(async () => {
        if (!channelName.trim()) {
            return Alert.alert('Chat channel name is required.');
        }

        setIsLoading(true);

        try {
            await createChannel({ name: channelName, participants: [driver.getAttribute('user'), ...selectedParticipants] });
            toast.success(`New chat channel created: ${channelName}`);
            navigation.goBack();
        } catch (err) {
            console.warn('Error creating new chat channel:', err);
        } finally {
            setIsLoading(false);
        }
    }, [channelName, createChannel, navigation]);

    const isSelected = useCallback(
        (participant) => {
            return selectedParticipants.some((selected) => selected === participant.id);
        },
        [selectedParticipants]
    );

    useEffect(() => {
        const loadAvailableParticipants = async () => {
            try {
                const loadedAvailableParticipants = await getAvailableParticipants();
                setAvailableParticipants(loadedAvailableParticipants);
            } catch (err) {
                console.warn('Error loading available participants:', err);
            }
        };

        if (availableParticipantsLoadedRef && availableParticipantsLoadedRef.current === false) {
            loadAvailableParticipants();
            availableParticipantsLoadedRef.current = true;
        }
    }, []);

    const renderParticipant = ({ item: participant }) => {
        return (
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                <XStack px='$3' py='$3' justifyContent='space-between' alignItems='center' bg={isSelected(participant) ? '$success' : 'transparent'}>
                    <XStack flex={1} alignItems='center' space='$3'>
                        <YStack>
                            <ChatParticipantAvatar participant={participant} size='$3' />
                        </YStack>
                        <YStack>
                            <Text color={isSelected(participant) ? '$successText' : '$textSecondary'} fontSize={16} numberOfLines={1}>
                                {participant.name}
                            </Text>
                        </YStack>
                    </XStack>
                    <YStack>
                        {isSelected(participant) ? (
                            <Button size='$2' bg='$error' borderWidth={1} borderColor='$errorBorder' onPress={() => handleUnselectParticipant(participant)}>
                                <Button.Icon>
                                    <FontAwesomeIcon icon={faTimes} color={theme['$errorText'].val} />
                                </Button.Icon>
                                <Button.Text color='$errorText'>Unselect</Button.Text>
                            </Button>
                        ) : (
                            <Button size='$2' bg='$success' borderWidth={1} borderColor='$successBorder' onPress={() => handleSelectParticipant(participant)}>
                                <Button.Icon>
                                    <FontAwesomeIcon icon={faCheck} color={theme['$successText'].val} />
                                </Button.Icon>
                                <Button.Text color='$successText'>Select</Button.Text>
                            </Button>
                        )}
                    </YStack>
                </XStack>
            </TouchableWithoutFeedback>
        );
    };

    return (
        <YStack flex={1} height='100%' bg='$background' pointerEvents='box-none'>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                <YStack bg='$background' justifyContent='center' py='$3' borderBottomWidth={1} borderColor='$borderColor'>
                    <XStack px='$3' alignItems='center'>
                        <XStack alignItems='center'>
                            <YStack mr='$2'>
                                <Button onPress={() => navigation.goBack()} bg='$surface' size='$3' circular>
                                    <Button.Icon>
                                        <FontAwesomeIcon icon={faChevronLeft} color={theme.textPrimary.val} size={16} />
                                    </Button.Icon>
                                </Button>
                            </YStack>
                            <YStack>
                                <Text color='$textPrimary' fontSize={24} fontWeight='bold'>
                                    Create new Chat
                                </Text>
                            </YStack>
                        </XStack>
                    </XStack>
                    <YStack mt='$5' pb='$2'>
                        <YStack px='$3' space='$2'>
                            <Text color='$textPrimary' fontSize={18} fontWeight='bold' px='$1'>
                                Channel Name
                            </Text>
                            <Input
                                value={channelName}
                                onChangeText={setChannelName}
                                placeholder='Input chat channel name...'
                                borderWidth={1}
                                color='$textPrimary'
                                borderColor='$borderColor'
                                borderRadius='$5'
                                bg='$surface'
                            />
                        </YStack>
                    </YStack>
                    <YStack mt='$4' px='$3' space='$2'>
                        <Text color='$textPrimary' fontSize={18} fontWeight='bold' px='$1'>
                            Select Participants:
                        </Text>
                    </YStack>
                </YStack>
            </TouchableWithoutFeedback>
            <FlatList
                data={availableParticipants.filter((user) => user.id !== driver.getAttribute('user'))}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps='always'
                renderItem={renderParticipant}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                ItemSeparatorComponent={() => <Separator borderBottomWidth={1} borderColor='$borderColor' />}
                ListFooterComponent={<Spacer height={200} />}
            />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 35 : 0}>
                <YStack bg='$background' borderTopWidth={1} borderColor='$borderColorWithShadow' px='$3' py='$4'>
                    <Button size='$5' bg='$success' borderWidth={1} borderColor='$successBorder' onPress={handleCreateChat}>
                        <Button.Icon>{isLoading ? <Spinner /> : <FontAwesomeIcon icon={faSave} color={theme['$successText'].val} />}</Button.Icon>
                        <Button.Text color='$successText'>Create new Chat</Button.Text>
                    </Button>
                    <Spacer height={25} />
                </YStack>
            </KeyboardAvoidingView>
        </YStack>
    );
};

export default CreateChatChannelScreen;
