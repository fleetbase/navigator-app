import React, { useState, useCallback } from 'react';
import { View, Text, ImageBackground, TouchableOpacity, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView, Pressable, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUniqueId } from 'react-native-device-info';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { useLocale, useDriver, useFleetbase } from 'hooks';
import { logError, translate, config, syncDevice, getColorCode, deepGet } from 'utils';
import { getLocation } from 'utils/Geo';
import { set, get } from 'utils/Storage';
import Toast from 'react-native-toast-message';
import FastImage from 'react-native-fast-image';
import tailwind from 'tailwind';
import PhoneInput from 'components/PhoneInput';

const isPhone = (phone = '') => {
    return /^[+]?[\s./0-9]*[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/g.test(phone);
};

const LoginScreen = ({ navigation, route }) => {
    const fleetbase = useFleetbase();
    const location = getLocation();
    const insets = useSafeAreaInsets();

    const [phone, setPhone] = useState(null);
    const [code, setCode] = useState(null);
    const [isAwaitingVerification, setIsAwaitingVerification] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(false);
    const [locale, setLocale] = useLocale();
    const [driver, setDriver] = useDriver();

    const isNotAwaitingVerification = isAwaitingVerification === false;
    const redirectTo = deepGet(route, 'params?.redirectTo', 'MainStack');

    const sendVerificationCode = useCallback(() => {
        setIsLoading(true);

        console.log('[phone]', phone);

        try {
            return fleetbase.drivers
                .login(phone)
                .then((response) => {
                    setIsAwaitingVerification(true);
                    setError(null);
                    setIsLoading(false);
                })
                .catch((error) => {
                    logError(error);
                    setIsLoading(false);
                    Toast.show({
                        type: 'error',
                        text1: '😅 Authentication Failed',
                        text2: error.message,
                    });
                });
        } catch (error) {
            logError(error);
            setIsLoading(false);
            Toast.show({
                type: 'error',
                text1: '😅 Authentication Failed',
                text2: error.message,
            });
        }
    });

    const verifyCode = useCallback(() => {
        setIsLoading(true);

        return fleetbase.drivers
            .verifyCode(phone, code)
            .then((driver) => {
                setDriver(driver);
                syncDevice(driver);
                setIsLoading(false);

                if (redirectTo) {
                    navigation.navigate(redirectTo);
                } else {
                    navigation.goBack();
                }
            })
            .catch((error) => {
                logError(error);
                Toast.show({
                    type: 'error',
                    text1: '😅 Authentication Failed',
                    text2: error.message,
                });
                retry();
            });
    });

    const retry = useCallback(() => {
        setIsLoading(false);
        setPhone(null);
        setIsAwaitingVerification(false);
    });

    return (
        <ImageBackground
            source={config('ui.loginScreen.containerBackgroundImage')}
            resizeMode={config('ui.loginScreen.containerBackgroundResizeMode') ?? 'cover'}
            style={[tailwind('flex-1'), config('ui.loginScreen.containerBackgroundImageStyle')]}
        >
            <View style={[tailwind('bg-gray-800 flex-row flex-1 items-center justify-center'), config('ui.loginScreen.containerStyle'), { paddingTop: insets.top }]}>
                <View style={tailwind('flex-grow')}>
                    <Pressable onPress={Keyboard.dismiss} style={[tailwind('px-5 -mt-28'), config('ui.loginScreen.contentContainerStyle')]}>
                        <KeyboardAvoidingView style={tailwind('')} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={100}>
                            <View style={tailwind('mb-10 flex items-center justify-center rounded-full')}>
                                <FastImage source={require('../../../../assets/icon.png')} style={tailwind('w-20 h-20 rounded-full')} />
                            </View>

                            {isNotAwaitingVerification && (
                                <View style={[tailwind('p-4'), config('ui.loginScreen.loginFormContainerStyle')]}>
                                    <View style={tailwind('mb-6 flex-row')}>
                                        <PhoneInput
                                            onChangeValue={setPhone}
                                            autoFocus={true}
                                            defaultCountryCode={deepGet(location, 'country', '+1')}
                                            style={[tailwind('flex-1'), config('ui.loginScreen.phoneInputStyle')]}
                                            {...(config('ui.createAccountScreen.phoneInputProps') ?? {})}
                                        />
                                    </View>
                                    <TouchableOpacity style={tailwind('mb-3')} onPress={sendVerificationCode}>
                                        <View style={[tailwind('btn bg-gray-900 border border-gray-700'), config('ui.loginScreen.sendVerificationCodeButtonStyle')]}>
                                            {isLoading && <ActivityIndicator size={'small'} color={getColorCode('text-blue-500')} style={tailwind('mr-2')} />}
                                            <Text style={[tailwind('font-semibold text-gray-50 text-lg text-center'), config('ui.loginScreen.sendVerificationCodeButtonTextStyle')]}>
                                                {translate('Auth.LoginScreen.sendVerificationCodeButtonText')}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            )}
                            {isAwaitingVerification && (
                                <View style={[tailwind(''), config('ui.loginScreen.verifyFormContainerStyle')]}>
                                    <View style={tailwind('mb-6')}>
                                        <TextInput
                                            onChangeText={setCode}
                                            autoFocus={true}
                                            textAlign={'center'}
                                            keyboardType={'phone-pad'}
                                            placeholder={translate('Auth.LoginScreen.codeInputPlaceholder')}
                                            placeholderTextColor={'rgba(156, 163, 175, 1)'}
                                            style={[tailwind('form-input flex flex-row text-gray-100 text-center mb-2.5'), config('ui.loginScreen.verifyCodeInputStyle')]}
                                            {...(config('ui.loginScreen.verifyCodeInputProps') ?? {})}
                                        />
                                        <View style={tailwind('flex flex-row justify-end w-full')}>
                                            <TouchableOpacity style={[tailwind('bg-gray-900 bg-opacity-50 px-4 py-2 rounded-md'), config('ui.loginScreen.retryButtonStyle')]} onPress={retry}>
                                                <Text style={[tailwind('text-blue-200 font-semibold'), config('ui.loginScreen.retryButtonTextStyle')]}>
                                                    {translate('Auth.LoginScreen.retryButtonText')}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    <TouchableOpacity onPress={verifyCode}>
                                        <View style={[tailwind('btn bg-gray-900 border border-gray-700'), config('ui.loginScreen.verifyCodeButtonStyle')]}>
                                            {isLoading && <ActivityIndicator size={'small'} color={getColorCode('text-blue-500')} style={tailwind('mr-2')} />}
                                            <Text style={[tailwind('font-semibold text-gray-50 text-lg text-center'), config('ui.loginScreen.verifyCodeButtonTextStyle')]}>
                                                {translate('Auth.LoginScreen.verifyCodeButtonText')}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </KeyboardAvoidingView>
                    </Pressable>
                </View>
            </View>
        </ImageBackground>
    );
};

export default LoginScreen;
