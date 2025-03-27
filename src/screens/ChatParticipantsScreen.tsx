import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, Pressable, Alert } from 'react-native';
import { Text, YStack, XStack, Button, Avatar, Separator, useTheme } from 'tamagui';
import { PortalHost } from '@gorhom/portal';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPlus, faTrash, faChevronLeft } from '@fortawesome/free-solid-svg-icons';
import { last, abbreviateName, later } from '../utils';
import { formatWhatsAppTimestamp } from '../utils/format';
import { useChat } from '../contexts/ChatContext';
import { useAuth } from '../contexts/AuthContext';
import useSocketClusterClient from '../hooks/use-socket-cluster-client';
import ChatParticipantAvatar from '../components/ChatParticipantAvatar';
import BottomSheetSelect from '../components/BottomSheetSelect';

const ChatParticipantsScreen = ({ route }) => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { sendMessage, reloadChannel, removeParticipant, addParticipant, getAvailableParticipants, getChannelCurrentParticipant } = useChat();
    const { listen } = useSocketClusterClient();
    const [channel, setChannel] = useState(route.params.channel);
    const [availableParticipants, setAvailableParticipants] = useState([]);
    const availableParticipantSheetRef = useRef();
    const availableParticipantsLoadedRef = useRef(false);
    const currentParticipant = getChannelCurrentParticipant(channel);
    const canRemoveParticipants = useMemo(() => {
        return channel.created_by === currentParticipant.user;
    }, [channel]);

    const synchronouslyRemoveParticipant = useCallback((participant) => {
        setChannel((prevChannel) => {
            const removedAlready = !prevChannel.participants.some((chatParticipant) => chatParticipant.id === participant.id);
            if (removedAlready) return prevChannel;

            return {
                ...prevChannel,
                participants: prevChannel.participants.filter((chatParticipant) => chatParticipant.id !== participant.id),
            };
        });
    }, []);

    const synchronouslyAddParticipant = useCallback((user) => {
        setChannel((prevChannel) => {
            const addedAlready = prevChannel.participants.some((chatParticipant) => chatParticipant.user === user.id);
            if (addedAlready) return prevChannel;

            return {
                ...prevChannel,
                participants: [...prevChannel.participants, { id: 'temp', user: user.id, ...user }],
            };
        });
    }, []);

    const handleRemoveParticipant = useCallback(
        (participant) => {
            Alert.alert(
                'Confirmation',
                'Are you sure you wish to remove this participant from the chat?',
                [
                    {
                        text: 'Cancel',
                        style: 'cancel',
                    },
                    {
                        text: 'Remove Participant',
                        onPress: async () => {
                            synchronouslyRemoveParticipant(participant);
                            await removeParticipant(channel, participant);
                            await reloadChannel(channel);
                        },
                    },
                ],
                { cancelable: false }
            );
        },
        [removeParticipant, reloadChannel]
    );

    const handleAddParticipant = useCallback(
        async (user) => {
            synchronouslyAddParticipant(user);
            await addParticipant(channel, user);
            await reloadChannel(channel);
        },
        [addParticipant, reloadChannel]
    );

    const handleOpenAvailableParticipants = useCallback(() => {
        if (availableParticipantSheetRef.current) {
            availableParticipantSheetRef.current.openBottomSheet();
        }
    }, [availableParticipantSheetRef.current]);

    useEffect(() => {
        const loadAvailableParticipants = async () => {
            try {
                const loadedAvailableParticipants = await getAvailableParticipants(channel);
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
            <YStack>
                <XStack px='$3' py='$3' justifyContent='space-between' alignItems='center'>
                    <XStack flex={1} alignItems='center' space='$3'>
                        <YStack>
                            <ChatParticipantAvatar participant={participant} size='$3' />
                        </YStack>
                        <YStack>
                            <Text color='$textSecondary' fontSize={16} numberOfLines={1}>
                                {participant.name}
                            </Text>
                        </YStack>
                    </XStack>
                    <XStack>
                        {canRemoveParticipants && participant.id !== currentParticipant.id && (
                            <YStack>
                                <Button size='$2' bg='$error' borderWidth={1} borderColor='$errorBorder' onPress={() => handleRemoveParticipant(participant)}>
                                    <Button.Icon>
                                        <FontAwesomeIcon icon={faTrash} color={theme['$errorText'].val} />
                                    </Button.Icon>
                                    <Button.Text color='$errorText'>Remove</Button.Text>
                                </Button>
                            </YStack>
                        )}
                    </XStack>
                </XStack>
            </YStack>
        );
    };

    const ParticipantsHeaderBar = () => {
        return (
            <YStack bg='$background' justifyContent='center' height={80} borderBottomWidth={1} borderColor='$borderColor'>
                <XStack px='$3' justifyContent='space-between' alignItems='center'>
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
                                Participants
                            </Text>
                        </YStack>
                    </XStack>
                    <YStack>
                        <Button onPress={handleOpenAvailableParticipants} size='$3' bg='$info' borderWidth={1} borderColor='$infoBorder'>
                            <Button.Icon>
                                <FontAwesomeIcon icon={faPlus} color={theme['$infoText'].val} />
                            </Button.Icon>
                            <Button.Text color='$infoText'>Add Participant</Button.Text>
                        </Button>
                    </YStack>
                </XStack>
            </YStack>
        );
    };

    return (
        <YStack flex={1} bg='$background'>
            <FlatList
                data={channel.participants}
                keyExtractor={(item) => item.id}
                renderItem={renderParticipant}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                ListHeaderComponent={<ParticipantsHeaderBar />}
                ItemSeparatorComponent={() => <Separator borderBottomWidth={1} borderColor='$borderColor' />}
            />
            <BottomSheetSelect
                ref={availableParticipantSheetRef}
                options={availableParticipants}
                onSelect={handleAddParticipant}
                renderOption={({ item: user, handleSelect }) => {
                    return (
                        <Pressable onPress={() => handleSelect(user)}>
                            <XStack px='$3' py='$3' justifyContent='space-between' alignItems='center'>
                                <XStack flex={1} alignItems='center' space='$3'>
                                    <YStack>
                                        <ChatParticipantAvatar participant={user} size='$3' />
                                    </YStack>
                                    <YStack>
                                        <Text color='$textSecondary' fontSize={16} numberOfLines={1}>
                                            {user.name}
                                        </Text>
                                    </YStack>
                                </XStack>
                            </XStack>
                        </Pressable>
                    );
                }}
                title='Select Participant'
                virtual={true}
                renderInPlace={false}
                portalHost='ChatParticipantsPortal'
            />
            <PortalHost name='ChatParticipantsPortal' />
        </YStack>
    );
};

export default ChatParticipantsScreen;
