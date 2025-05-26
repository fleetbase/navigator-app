import React, { useEffect, useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Platform } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { Image, Spinner, XStack, Text, YStack, useTheme } from 'tamagui';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'react-native-linear-gradient';
import { setI18nConfig } from '../utils/localize';
import { config, toArray, isArray, later } from '../utils';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import useFleetbase from '../hooks/use-fleetbase';
import BootSplash from 'react-native-bootsplash';
import SetupWarningScreen from './SetupWarningScreen';

const APP_NAME = config('APP_NAME');
const BootScreen = ({ route }) => {
    const params = route.params ?? {};
    const theme = useTheme();
    const navigation = useNavigation();
    const { hasFleetbaseConfig } = useFleetbase();
    const { isAuthenticated } = useAuth();
    const { t } = useLanguage();
    const [error, setError] = useState<Error | null>(null);
    const backgroundColor = toArray(config('BOOTSCREEN_BACKGROUND_COLOR', '$background'));
    const isGradientBackground = isArray(backgroundColor) && backgroundColor.length > 1;
    const locationEnabled = params.locationEnabled;

    useFocusEffect(
        useCallback(() => {
            const checkLocationPermission = async () => {
                const permission = Platform.OS === 'ios' ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

                const result = await check(permission);
                if (result === RESULTS.GRANTED) {
                    initializeNavigator();
                } else {
                    later(() => BootSplash.hide(), 300);
                    // If the locationEnabled flag is set meaning not null or undefined then initialize navigator
                    if (locationEnabled !== undefined && locationEnabled !== null) {
                        initializeNavigator();
                    } else {
                        navigation.navigate('LocationPermission');
                    }
                }
            };

            const initializeNavigator = async () => {
                if (!hasFleetbaseConfig()) {
                    return setError(new Error(t('BootScreen.missingRequiredConfigurationKeys')));
                }

                try {
                    later(() => {
                        try {
                            // Any initialization processes will run here
                            if (isAuthenticated) {
                                navigation.navigate('DriverNavigator');
                            } else {
                                navigation.navigate('Login');
                            }
                        } catch (err) {
                            console.warn('Failed to navigate to screen:', err);
                        }
                    }, 0);
                } catch (initializationError) {
                    setError(initializationError);
                } finally {
                    later(() => BootSplash.hide(), 300);
                }
            };

            checkLocationPermission();
        }, [navigation, isAuthenticated])
    );

    if (error) {
        return <SetupWarningScreen error={error} />;
    }

    return (
        <YStack flex={1} bg={backgroundColor[0]} alignItems='center' justifyContent='center' width='100%' height='100%'>
            {isGradientBackground && (
                <LinearGradient
                    colors={backgroundColor}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        height: '100%',
                        width: '100%',
                    }}
                />
            )}
            <YStack alignItems='center' justifyContent='center'>
                <Image source={require('../../assets/splash-screen.png')} width={100} height={100} borderRadius='$4' mb='$1' />
                <XStack mt='$2' alignItems='center' justifyContent='center' space='$3'>
                    <Spinner size='small' color='$textPrimary' />
                </XStack>
            </YStack>
        </YStack>
    );
};

export default BootScreen;
