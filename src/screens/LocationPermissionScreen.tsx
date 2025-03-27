import React, { useState, useCallback, useEffect } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, Linking, SafeAreaView } from 'react-native';
import { checkMultiple, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { Button, Text, YStack, Image, Stack, XStack, AlertDialog } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faMapMarkerAlt } from '@fortawesome/free-solid-svg-icons';
import { requestWebGeolocationPermission } from '../utils/location';
import { useLanguage } from '../contexts/LanguageContext';
import useDimensions from '../hooks/use-dimensions';

const LocationPermissionScreen = () => {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { screenWidth } = useDimensions();
    const { t } = useLanguage();
    const [isDialogOpen, setDialogOpen] = useState(false);
    const [hasPermission, setHasPermission] = useState(false);
    const [permissionAttempted, setPermissionAttempted] = useState(false);

    const openSettings = () => {
        Linking.openSettings();
        setDialogOpen(false);
    };

    const handleLocationPermissionCheck = async () => {
        const permission = Platform.OS === 'ios' ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;
        const result = await request(permission);

        return result === RESULTS.GRANTED;
    };

    const requestLocationPermission = useCallback(async () => {
        if (Platform.OS === 'web') {
            // Use the browser Permissions API (and geolocation prompt) on web
            const granted = await requestWebGeolocationPermission();
            setPermissionAttempted(true);
            setHasPermission(granted);
            if (granted) {
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'Boot' }],
                });
            } else {
                setDialogOpen(true);
            }
            return;
        }

        const granted = await handleLocationPermissionCheck();
        if (granted) {
            return navigation.reset({
                index: 0,
                routes: [{ name: 'Boot' }],
            });
        }

        setDialogOpen(true);
    }, [navigation]);

    // Function to check if permission has been granted when returning to the screen
    const checkPermissionStatus = useCallback(async () => {
        if (Platform.OS === 'web') {
            const granted = await requestWebGeolocationPermission();
            if (granted) {
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'Boot' }],
                });
            }
            return;
        }

        const granted = await handleLocationPermissionCheck();
        if (granted) {
            return navigation.reset({
                index: 0,
                routes: [{ name: 'Boot' }],
            });
        }
    }, [navigation]);

    // Recheck permission status when the screen gains focus
    useFocusEffect(
        useCallback(() => {
            checkPermissionStatus();
        }, [checkPermissionStatus])
    );

    // Automatically trigger the native permission prompt when the screen mounts
    useEffect(() => {
        if (!permissionAttempted) {
            requestLocationPermission();
        }
    }, [permissionAttempted]);

    return (
        <YStack flex={1} bg='$background' pt={insets.top} pb={insets.bottom}>
            <YStack flex={1} alignItems='center' justifyContent='center' padding='$6'>
                <YStack flex={1} alignItems='center' justifyContent='center'>
                    <Stack alignItems='center' justifyContent='center'>
                        <Image source={require('../../assets/images/isometric-geolocation-1.png')} width={360} height={360} resizeMode='contain' />
                    </Stack>
                    <Text fontSize='$8' fontWeight='bold' color='$textPrimary' mb='$2' textAlign='center'>
                        {t('LocationPermissionScreen.enableLocationServices')}
                    </Text>
                    <Text color='$textSecondary' fontSize='$4' textAlign='center' mb='$6'>
                        {t('LocationPermissionScreen.enableLocationPrompt')}
                    </Text>
                    <Button size='$5' bg='$primary' color='$white' width='100%' onPress={requestLocationPermission} icon={<FontAwesomeIcon icon={faMapMarkerAlt} color='white' />}>
                        {t('LocationPermissionScreen.shareAndContinue')}
                    </Button>
                </YStack>
            </YStack>
            <AlertDialog open={isDialogOpen} onOpenChange={setDialogOpen}>
                <AlertDialog.Trigger asChild>
                    <Button display='none'>Show Alert</Button>
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay key='overlay' animation='quick' opacity={0.5} />
                    <AlertDialog.Content bordered elevate key='content' backgroundColor='$background' width={screenWidth * 0.9} padding='$6'>
                        <AlertDialog.Title color='$textPrimary' fontSize={27}>
                            {t('LocationPermissionScreen.locationPermissionRequired')}
                        </AlertDialog.Title>
                        <AlertDialog.Description color='$textSecondary' mb='$4'>
                            {t('LocationPermissionScreen.locationPermissionPrompt')}
                        </AlertDialog.Description>
                        {Platform.OS !== 'web' && (
                            <Button onPress={openSettings} backgroundColor='$primary' color='$primaryText' mb='$2'>
                                {t('LocationPermissionScreen.goToSettings')}
                            </Button>
                        )}
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog>
        </YStack>
    );
};

export default LocationPermissionScreen;
