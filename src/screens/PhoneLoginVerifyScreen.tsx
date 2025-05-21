import React, { useEffect, useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, Pressable, Keyboard, StyleSheet } from 'react-native';
import { Spinner, Button, Input, Stack, Text, YStack, XStack, useTheme } from 'tamagui';
import { toast, ToastPosition } from '@backpackapp-io/react-native-toast';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCheck, faArrowRotateRight, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { OtpInput } from 'react-native-otp-entry';
import { useAuth } from '../contexts/AuthContext';
import { navigatorConfig } from '../utils';
import LinearGradient from 'react-native-linear-gradient';

const PhoneLoginVerifyScreen = () => {
    const navigation = useNavigation();
    const theme = useTheme();
    const { phone, verifyCode, isVerifyingCode, loginMethod } = useAuth();
    const [code, setCode] = useState(null);

    const handleVerifyCode = async (code) => {
        if (isVerifyingCode) {
            return;
        }

        try {
            await verifyCode(code);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleRetry = () => {
        setCode('');
        navigation.goBack();
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: navigatorConfig('colors.loginBackground') }}>
            <LinearGradient colors={['rgba(0, 0, 0, 0.0)', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.8)']} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
            <YStack flex={1} space='$3' padding='$5'>
                <YStack mb='$4'>
                    <Text color='$gray-300' fontSize={20} fontWeight='bold'>
                        Code sent to {phone}
                    </Text>
                </YStack>
                <OtpInput
                    numberOfDigits={6}
                    onTextChange={setCode}
                    onFilled={handleVerifyCode}
                    focusColor={theme.primary.val}
                    theme={{ pinCodeContainerStyle: { borderColor: theme['blue-300'].val, height: 50, width: 50 }, pinCodeTextStyle: { color: theme.primary.val, fontSize: 25 } }}
                />
                <Button size='$5' onPress={() => handleVerifyCode(code)} bg='$primary' width='100%' opacity={isVerifyingCode ? 0.75 : 1} disabled={isVerifyingCode} rounded>
                    <Button.Icon>{isVerifyingCode ? <Spinner color='$white' /> : <FontAwesomeIcon icon={faCheck} color={theme.white.val} />}</Button.Icon>
                    <Button.Text color='$gray-200' fontWeight='bold'>
                        Verify Code
                    </Button.Text>
                </Button>
                <Button size='$5' onPress={handleRetry} bg='$secondary' width='100%' rounded>
                    <Button.Icon>
                        <FontAwesomeIcon icon={faArrowRotateRight} color={theme['gray-500'].val} />
                    </Button.Icon>
                    <Button.Text color='$textPrimary' fontWeight='bold'>
                        Retry
                    </Button.Text>
                </Button>
                {loginMethod === 'email' && (
                    <YStack mt='$4'>
                        <XStack bg='$info' borderWidth={1} borderColor='$infoBorder' borderRadius='$4' alignItems='start' px='$3' py='$3' space='$2' flexWrap='wrap'>
                            <YStack pt={2}>
                                <FontAwesomeIcon icon={faCircleInfo} color={theme['$infoText'].val} size={20} />
                            </YStack>
                            <YStack flex={1}>
                                <Text fontSize={15} color='$infoText' fontWeight='bold'>
                                    Unable to send SMS.
                                </Text>
                                <Text fontSize={15} color='$infoText'>
                                    Your verification code was sent via <Text fontWeight='bold'>{loginMethod}</Text>.
                                </Text>
                            </YStack>
                        </XStack>
                    </YStack>
                )}
            </YStack>
            <YStack flex={1} position='relative' width='100%'>
                <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} pointerEvents='box-only' />
            </YStack>
        </SafeAreaView>
    );
};

export default PhoneLoginVerifyScreen;
