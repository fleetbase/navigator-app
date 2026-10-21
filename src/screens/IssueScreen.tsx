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
import { translateLabel } from '../utils/localize';
import { useTempStore } from '../contexts/TempStoreContext';
import { useLanguage } from '../contexts/LanguageContext';
import Badge from '../components/Badge';
import LoadingOverlay from '../components/LoadingOverlay';
import HeaderButton from '../components/HeaderButton';
import PlaceMapView from '../components/PlaceMapView';
import useFleetbase from '../hooks/use-fleetbase';

const IssueScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { t } = useLanguage();
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

        Alert.alert(t('IssueScreen.confirmDeletion'), t('IssueScreen.deletePrompt'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('IssueScreen.deleteIssue'), onPress: handleDelete },
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
            <LoadingOverlay visible={isLoading} text={t('IssueScreen.deletingIssue')} />
            <YStack py='$3' space='$3'>
                <XStack px='$3' alignItems='center' space='$3'>
                    <YStack alignItems='flex-start'>
                        <Text color='$textSecondary' fontSize={17} fontWeight='bold'>
                            {t('IssueScreen.type')}
                        </Text>
                    </YStack>
                    <YStack flex={1} alignItems='flex-end'>
                        <Text color='$textPrimary' fontSize={17} numberOfLines={1}>
                            {translateLabel('issueTypes', issue.type, humanize(issue.type))}
                        </Text>
                    </YStack>
                </XStack>
                <Separator />
                <XStack px='$3' alignItems='center' space='$3'>
                    <YStack alignItems='flex-start'>
                        <Text color='$textSecondary' fontSize={17} fontWeight='bold'>
                            {t('IssueScreen.category')}
                        </Text>
                    </YStack>
                    <YStack flex={1} alignItems='flex-end'>
                        <Text color='$textPrimary' fontSize={17} numberOfLines={1}>
                            {translateLabel('issueCategories', issue.category, titleize(issue.category))}
                        </Text>
                    </YStack>
                </XStack>
                <Separator />
                <XStack px='$3' alignItems='center' space='$3'>
                    <YStack alignItems='flex-start'>
                        <Text color='$textSecondary' fontSize={17} fontWeight='bold'>
                            {t('IssueScreen.vehicle')}
                        </Text>
                    </YStack>
                    <YStack flex={1} alignItems='flex-end'>
                        <Text color='$textPrimary' fontSize={17} numberOfLines={1}>
                            {issue.vehicle_name ?? t('common.notAvailable')}
                        </Text>
                    </YStack>
                </XStack>
                <Separator />
                <XStack px='$3' alignItems='center' space='$3'>
                    <YStack alignItems='flex-start'>
                        <Text color='$textSecondary' fontSize={17} fontWeight='bold'>
                            {t('IssueScreen.priority')}
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
                            {t('IssueScreen.status')}
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
                            {t('IssueScreen.report')}
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
                            {t('IssueScreen.reportLocation')}
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
