import React, { useState, useCallback } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, Linking } from 'react-native';
import { request, check, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { Button, Text, YStack, Image, XStack, AlertDialog } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faMapMarkerAlt } from '@fortawesome/free-solid-svg-icons';
import { requestWebGeolocationPermission } from '../utils/location';
import { useLanguage } from '../contexts/LanguageContext';
import useDimensions from '../hooks/use-dimensions';

const LocationPermissionScreen: React.FC = () => {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { screenWidth } = useDimensions();
    const { t } = useLanguage();

    const [isDialogOpen, setDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<'retry' | 'settings'>('retry');

    // Navigate to Boot, passing whether location is enabled
    const finish = useCallback(
        (granted: boolean) => {
            navigation.reset({
                index: 0,
                routes: [{ name: 'Boot', params: { locationEnabled: granted } }],
            });
        },
        [navigation]
    );

    // Open app settings
    const openSettings = () => {
        Linking.openSettings();
        setDialogOpen(false);
    };

    // Re-check status when coming back from Settings
    useFocusEffect(
        useCallback(() => {
            if (Platform.OS === 'web') return;
            (async () => {
                const perm = PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;
                const status = await check(perm);
                if (status === RESULTS.GRANTED) {
                    finish(true);
                }
            })();
        }, [finish])
    );

    // Request permission and decide dialog mode
    const requestLocationPermission = useCallback(async () => {
        if (Platform.OS === 'web') {
            const granted = await requestWebGeolocationPermission();
            return finish(granted);
        }

        const perm = Platform.OS === 'ios' ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

        const status = await request(perm);
        if (status === RESULTS.GRANTED) {
            return finish(true);
        }

        if (status === RESULTS.DENIED) {
            setDialogMode('retry');
        } else {
            setDialogMode('settings');
        }
        setDialogOpen(true);
    }, [finish]);

    return (
        <YStack flex={1} bg='$background' pt={insets.top} pb={insets.bottom} alignItems='center' justifyContent='center' padding='$6'>
            <YStack alignItems='center' justifyContent='center'>
                <Image source={require('../../assets/images/isometric-geolocation-1.png')} width={360} height={360} resizeMode='contain' />
            </YStack>

            <Text fontSize='$8' fontWeight='bold' color='$textPrimary' mb='$2' textAlign='center'>
                {t('LocationPermissionScreen.enableLocationServices')}
            </Text>
            <Text color='$textSecondary' fontSize='$4' textAlign='center' mb='$6'>
                {t('LocationPermissionScreen.enableLocationPrompt')}
            </Text>

            <Button size='$5' bg='$primary' color='$white' width='100%' onPress={requestLocationPermission} icon={<FontAwesomeIcon icon={faMapMarkerAlt} color='white' />}>
                <Button.Text color='$white'>{t('LocationPermissionScreen.shareAndContinue')}</Button.Text>
            </Button>

            <Button size='$5' variant='ghost' mt='$3' onPress={() => finish(false)}>
                <Button.Text color='$textSecondary'>{t('LocationPermissionScreen.skipForNow')}</Button.Text>
            </Button>

            <AlertDialog open={isDialogOpen} onOpenChange={setDialogOpen}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay key='overlay' animation='quick' opacity={0.5} />
                    <AlertDialog.Content elevate bordered key='content' bg='$background' width={screenWidth * 0.9} px='$4' py='$3' borderWidth={1} borderColor='$borderColor'>
                        <AlertDialog.Title color='$textPrimary' fontSize={24}>
                            {dialogMode === 'retry' ? t('LocationPermissionScreen.permissionNeededTitle') : t('LocationPermissionScreen.enableInSettingsTitle')}
                        </AlertDialog.Title>

                        <AlertDialog.Description color='$textSecondary' mb='$6' mt='$2'>
                            {dialogMode === 'retry' ? t('LocationPermissionScreen.permissionDeniedPrompt') : t('LocationPermissionScreen.locationBlockedPrompt')}
                        </AlertDialog.Description>

                        <XStack space='$3' justifyContent='flex-end'>
                            <Button
                                bg='$secondary'
                                borderWidth={1}
                                borderColor='$borderColorWithShadow'
                                onPress={() => {
                                    setDialogOpen(false);
                                    finish(false);
                                }}
                            >
                                {t('common.cancel')}
                            </Button>

                            {dialogMode === 'retry' && (
                                <Button
                                    bg='$info'
                                    borderWidth={1}
                                    borderColor='$infoBorder'
                                    onPress={() => {
                                        setDialogOpen(false);
                                        requestLocationPermission();
                                    }}
                                >
                                    {t('common.tryAgain')}
                                </Button>
                            )}

                            {dialogMode === 'settings' && (
                                <Button onPress={openSettings} bg='$info' borderWidth={1} borderColor='$infoBorder'>
                                    {t('LocationPermissionScreen.goToSettings')}
                                </Button>
                            )}
                        </XStack>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog>
        </YStack>
    );
};

export default LocationPermissionScreen;
