import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, Image, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Stack, Text, YStack, XStack, useTheme, Button } from 'tamagui';
import { toast, ToastPosition } from '@backpackapp-io/react-native-toast';
import { titleize } from '../utils/format';
import { navigatorConfig } from '../utils';
import { PhoneLoginButton, AppleLoginButton, FacebookLoginButton, GoogleLoginButton } from '../components/Buttons';
import useOAuth from '../hooks/use-oauth';
import LinearGradient from 'react-native-linear-gradient';

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
            console.error('Error attempting OAuth login:', err);
        }
    };

    return (
        <YStack flex={1} height='100%' width='100%' bg='#111827'>
            <LinearGradient colors={['rgba(0, 0, 0, 0.0)', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.8)']} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
            <YStack justifyContent='center' alignItems='center' paddingTop={insets.top} marginTop={windowHeight / 3}>
                <Image source={require('../../assets/navigator-icon-transparent.png')} style={{ width: 60, height: 60 }} />
            </YStack>
            <SafeAreaView style={{ flex: 1 }}>
                <YStack flex={1} justifyContent='flex-end' alignItems='center' space='$3' px='$5' pb='$6'>
                    <PhoneLoginButton onPress={handlePhoneLogin} />
                    <XStack gap='$2'>
                        {loginSupported('apple') && <AppleLoginButton flex={1} onPress={() => handleOAuthLogin('apple')} />}
                        {loginSupported('facebook') && <FacebookLoginButton flex={1} onPress={() => handleOAuthLogin('facebook')} />}
                        {loginSupported('google') && <GoogleLoginButton flex={1} onPress={() => handleOAuthLogin('google')} />}
                    </XStack>
                </YStack>
            </SafeAreaView>
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
