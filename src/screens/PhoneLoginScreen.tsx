import React, { useEffect, useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, Pressable, Keyboard, StyleSheet } from 'react-native';
import { Spinner, Input, Stack, Text, YStack, useTheme, Button } from 'tamagui';
import { toast, ToastPosition } from '@backpackapp-io/react-native-toast';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPaperPlane, faKey, faArrowRight, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { isValidPhoneNumber, navigatorConfig } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import useAppTheme from '../hooks/use-app-theme';
import PhoneInput from '../components/PhoneInput';
import LinearGradient from 'react-native-linear-gradient';

const PhoneLoginScreen = () => {
    const navigation = useNavigation();
    const theme = useTheme();
    const { isDarkMode } = useAppTheme();
    const { login, isSendingCode, phone: phoneState, loginMethod } = useAuth();
    const [phone, setPhone] = useState(phoneState);

    const handleSendVerificationCode = async () => {
        if (isSendingCode) {
            return;
        }

        if (!isValidPhoneNumber(phone)) {
            return toast.error('Invalid phone number provided.');
        }

        try {
            await login(phone);
            navigation.navigate('PhoneLoginVerify');
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleGoBackHome = () => {
        navigation.goBack();
    };

    const handleCreateAccount = () => {
        navigation.navigate('CreateAccount');
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: navigatorConfig('colors.loginBackground') }}>
            <LinearGradient colors={['rgba(0, 0, 0, 0.0)', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.8)']} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
            <YStack flex={1} alignItems='center' space='$3'>
                <YStack space='$2' width='100%' px='$5' pt='$5'>
                    <Text color='$gray-200' fontWeight='bold' fontSize='$8' mb='$3'>
                        Login via SMS
                    </Text>
                    <PhoneInput value={phone} onChange={(phoneNumber) => setPhone(phoneNumber)} />
                    <Button size='$5' onPress={handleSendVerificationCode} bg='$primary' width='100%' opacity={isSendingCode ? 0.75 : 1} disabled={isSendingCode} rounded>
                        <Button.Icon>{isSendingCode ? <Spinner color='$white' /> : <FontAwesomeIcon icon={faPaperPlane} color={'#fff'} />}</Button.Icon>
                        <Button.Text color='$white' fontWeight='bold'>
                            Send Verification Code
                        </Button.Text>
                    </Button>
                </YStack>

                <YStack flex={1} position='relative' width='100%'>
                    <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} pointerEvents='box-only' />
                </YStack>

                <YStack space='$4' width='100%' padding='$5'>
                    <Button size='$5' onPress={handleGoBackHome} bg={isDarkMode ? '$secondary' : '$gray-700'} width='100%' rounded>
                        <Button.Icon>
                            <FontAwesomeIcon icon={faArrowLeft} color={isDarkMode ? theme['textPrimary'].val : theme['$gray-400'].val} />
                        </Button.Icon>
                        <Button.Text color={isDarkMode ? theme['textPrimary'].val : theme['$gray-400'].val} fontWeight='bold'>
                            Home
                        </Button.Text>
                    </Button>
                </YStack>
            </YStack>
        </SafeAreaView>
    );
};

export default PhoneLoginScreen;
