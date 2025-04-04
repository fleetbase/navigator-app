import { useState, useEffect, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert } from 'react-native';
import { Text, YStack, XStack, Button, Spinner, Separator, useTheme } from 'tamagui';
import { Place } from '@fleetbase/sdk';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faTimes, faPenToSquare, faTrash } from '@fortawesome/free-solid-svg-icons';
import { Portal } from '@gorhom/portal';
import { humanize, titleize } from 'inflected';
import { isResource } from '../utils';
import { useTempStore } from '../contexts/TempStoreContext';
import Badge from '../components/Badge';
import LoadingOverlay from '../components/LoadingOverlay';
import HeaderButton from '../components/HeaderButton';
import PlaceMapView from '../components/PlaceMapView';
import useFleetbase from '../hooks/use-fleetbase';

const IssueScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { adapter } = useFleetbase();
    const {
        store: { issue },
    } = useTempStore();
    const location = new Place({ id: issue.id, location: issue.location });
    const [isLoading, setIsLoading] = useState(false);

    const handleDeleteIssue = useCallback(() => {
        const handleDelete = async () => {
            setIsLoading(true);

            try {
                await adapter.delete(`issues/${issue.id}`);
                navigation.goBack();
            } catch (err) {
                console.warn('Error deleting issue:', err);
            } finally {
                setIsLoading(false);
            }
        };

        Alert.alert('Confirm Deletion', 'Are you sure you want to delete this Issue?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete Issue', onPress: handleDelete },
        ]);
    }, [adapter]);

    return (
        <YStack flex={1} bg='$background'>
            <Portal hostName='IssueScreenHeaderRightPortal'>
                <XStack space='$3'>
                    <HeaderButton
                        icon={faPenToSquare}
                        onPress={() => navigation.navigate('EditIssue', { issue })}
                        bg='$info'
                        iconColor='$infoText'
                        borderWidth={1}
                        borderColor='$infoBorder'
                    />
                    <HeaderButton icon={faTrash} onPress={handleDeleteIssue} bg='$error' iconColor='$errorText' borderWidth={1} borderColor='$errorBorder' />
                    <HeaderButton icon={faTimes} onPress={() => navigation.goBack()} />
                </XStack>
            </Portal>
            <LoadingOverlay visible={isLoading} text='Deleting Issue...' />
            <YStack py='$3' space='$3'>
                <XStack px='$3' alignItems='center' space='$3'>
                    <YStack alignItems='flex-start'>
                        <Text color='$textSecondary' fontSize={17} fontWeight='bold'>
                            Type:
                        </Text>
                    </YStack>
                    <YStack flex={1} alignItems='flex-end'>
                        <Text color='$textPrimary' fontSize={17} numberOfLines={1}>
                            {humanize(issue.type)}
                        </Text>
                    </YStack>
                </XStack>
                <Separator />
                <XStack px='$3' alignItems='center' space='$3'>
                    <YStack alignItems='flex-start'>
                        <Text color='$textSecondary' fontSize={17} fontWeight='bold'>
                            Category:
                        </Text>
                    </YStack>
                    <YStack flex={1} alignItems='flex-end'>
                        <Text color='$textPrimary' fontSize={17} numberOfLines={1}>
                            {titleize(issue.category)}
                        </Text>
                    </YStack>
                </XStack>
                <Separator />
                <XStack px='$3' alignItems='center' space='$3'>
                    <YStack alignItems='flex-start'>
                        <Text color='$textSecondary' fontSize={17} fontWeight='bold'>
                            Vehicle:
                        </Text>
                    </YStack>
                    <YStack flex={1} alignItems='flex-end'>
                        <Text color='$textPrimary' fontSize={17} numberOfLines={1}>
                            {issue.vehicle_name ?? 'N/A'}
                        </Text>
                    </YStack>
                </XStack>
                <Separator />
                <XStack px='$3' alignItems='center' space='$3'>
                    <YStack alignItems='flex-start'>
                        <Text color='$textSecondary' fontSize={17} fontWeight='bold'>
                            Priority:
                        </Text>
                    </YStack>
                    <YStack flex={1} alignItems='flex-end'>
                        <Badge status={issue.priority} fontSize={13} py='$2' />
                    </YStack>
                </XStack>
                <Separator />
                <XStack px='$3' alignItems='center' space='$3'>
                    <YStack alignItems='flex-start'>
                        <Text color='$textSecondary' fontSize={17} fontWeight='bold'>
                            Status:
                        </Text>
                    </YStack>
                    <YStack flex={1} alignItems='flex-end'>
                        <Badge status={issue.status} fontSize={13} py='$2' />
                    </YStack>
                </XStack>
                <Separator />
                <YStack px='$3' space='$3'>
                    <YStack alignItems='flex-start'>
                        <Text color='$textSecondary' fontSize={17} fontWeight='bold'>
                            Report:
                        </Text>
                    </YStack>
                    <YStack py='$2'>
                        <Text color='$textPrimary' fontSize={18}>
                            {issue.report}
                        </Text>
                    </YStack>
                </YStack>
                <Separator />
                <YStack px='$3' space='$3'>
                    <YStack alignItems='flex-start'>
                        <Text color='$textSecondary' fontSize={17} fontWeight='bold'>
                            Report Location:
                        </Text>
                    </YStack>
                    <YStack flex={1} alignItems='flex-start'>
                        <PlaceMapView place={location} width='100%' height={200} borderWidth={1} borderColor='$borderColor' />
                    </YStack>
                </YStack>
            </YStack>
        </YStack>
    );
};

export default IssueScreen;
