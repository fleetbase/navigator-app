import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, Image, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Stack, Text, YStack, XStack, useTheme, Button } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPlug } from '@fortawesome/free-solid-svg-icons';
import { toast, ToastPosition } from '@backpackapp-io/react-native-toast';
import { titleize } from '../utils/format';
import { navigatorConfig } from '../utils';
import { PhoneLoginButton, AppleLoginButton, FacebookLoginButton, GoogleLoginButton } from '../components/Buttons';
import useOAuth from '../hooks/use-oauth';
import LinearGradient from 'react-native-linear-gradient';
import DeviceInfo from 'react-native-device-info';

const LoginScreen = () => {
    const navigation = useNavigation();
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const windowHeight = Dimensions.get('window').height;
    const { login, loginSupported, loading } = useOAuth();

    const handlePhoneLogin = () => {
        navigation.navigate('PhoneLogin');
    };

    const handleOAuthLogin = async (provider) => {
        try {
            const response = await login(provider);
            toast.success(`Logged in with ${titleize(provider)}`);
        } catch (err) {
            console.warn('Error attempting OAuth login:', err);
        }
    };

    const handleOpenInstanceLink = () => {
        navigation.navigate('InstanceLink');
    };

    return (
        <YStack flex={1} height='100%' width='100%' bg={navigatorConfig('colors.loginBackground')} position='relative'>
            <LinearGradient colors={['rgba(0, 0, 0, 0.0)', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.8)']} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
            <YStack justifyContent='center' alignItems='center' paddingTop={insets.top} marginTop={windowHeight / 3}>
                <Image source={require('../../assets/navigator-icon-transparent.png')} style={{ width: 60, height: 60 }} />
            </YStack>
            <SafeAreaView style={{ flex: 1 }}>
                <YStack flex={1} justifyContent='flex-end' alignItems='center' space='$3' px='$5' pb='$6'>
                    <PhoneLoginButton onPress={handlePhoneLogin} />
                    <Text color='$textSecondary' fontSize='$2'>
                        v{DeviceInfo.getVersion()} #{DeviceInfo.getBuildNumber()}
                    </Text>
                </YStack>
            </SafeAreaView>
            <YStack position='absolute' top={0} right={0} pt={insets.top}>
                <Button onPress={handleOpenInstanceLink} bg='transparent'>
                    <Button.Icon>
                        <FontAwesomeIcon icon={faPlug} color={theme['$textSecondary'].val} />
                    </Button.Icon>
                </Button>
            </YStack>
            {loading && (
                <YStack justifyContent='center' alignItems='center' bg='rgba(0, 0, 0, 0.6)' position='absolute' top={0} bottom={0} left={0} right={0}>
                    <Spinner size='large' color='white' />
                </YStack>
            )}
        </YStack>
    );
};

const styles = StyleSheet.create({
    background: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
});

export default LoginScreen;
