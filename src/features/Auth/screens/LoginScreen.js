import React, { useState } from 'react';
import { View, Text, ImageBackground, TouchableOpacity, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView, Pressable, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUniqueId } from 'react-native-device-info';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { useLocale, useDriver, useFleetbase } from 'hooks';
import { logError, translate, config, syncDevice, getColorCode } from 'utils';
import { getLocation } from 'utils/Geo';
import { set, get } from 'utils/Storage';
import FastImage from 'react-native-fast-image';
import tailwind from 'tailwind';
import PhoneInput from 'ui/PhoneInput';

const isIos = Platform.OS === 'ios';
// const isAndroid = Platform.OS === 'android';

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
    const redirectTo = route?.params?.redirectTo ?? 'MainScreen';

    const sendVerificationCode = () => {
        setIsLoading(true);

        fleetbase.drivers
            .login(phone)
            .then((response) => {
                setIsAwaitingVerification(true);
                setError(null);
                setIsLoading(false);
            })
            .catch((error) => {
                logError(error);
                setIsLoading(false);
                setError(error.message);
            });
    };

    const verifyCode = () => {
        setIsLoading(true);

        fleetbase.drivers
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
                setError(error.message);
                retry();
            });
    };

    const retry = () => {
        setIsLoading(false);
        setPhone(null);
        setIsAwaitingVerification(false);
    };

    return (
        <ImageBackground
            source={config('ui.loginScreen.containerBackgroundImage')}
            resizeMode={config('ui.loginScreen.containerBackgroundResizeMode') ?? 'cover'}
            style={[config('ui.loginScreen.containerBackgroundImageStyle')]}
        >
            <View style={[tailwind('w-full h-full bg-gray-800 relative flex items-center justify-center'), config('ui.loginScreen.containerStyle'), { paddingTop: insets.top }]}>
                <View style={tailwind('w-full')}>
                    <Pressable onPress={Keyboard.dismiss} style={[tailwind('w-full h-full flex items-center justify-center px-10'), config('ui.loginScreen.contentContainerStyle')]}>
                        <View style={tailwind('mb-10 flex items-center justify-center rounded-full w-full')}>
                            <FastImage source={require('../../../../assets/icon.png')} style={tailwind('w-20 h-20 rounded-full')} />
                        </View>
                        {error && (
                            <View style={tailwind('mb-8 px-4 py-2 w-full flex flex-row items-center justify-center bg-red-100 border border-red-500 rounded-xl')}>
                                <Text style={tailwind('text-lg text-red-700 text-base font-semibold')}>{error}</Text>
                            </View>
                        )}
                        <KeyboardAvoidingView behavior={isIos ? 'padding' : 'height'} keyboardVerticalOffset={90}>
                            {isNotAwaitingVerification && (
                                <View style={[tailwind(''), config('ui.loginScreen.loginFormContainerStyle')]}>
                                    <View style={tailwind('mb-6')}>
                                        <PhoneInput
                                            value={phone}
                                            onChangeText={setPhone}
                                            defaultCountry={location?.country}
                                            style={config('ui.loginScreen.phoneInputStyle')}
                                            {...(config('ui.createAccountScreen.phoneInputProps') ?? {})}
                                        />
                                    </View>
                                    <TouchableOpacity style={tailwind('mb-3')} onPress={sendVerificationCode}>
                                        <View style={[tailwind('btn bg-gray-900 border border-gray-700'), config('ui.loginScreen.sendVerificationCodeButtonStyle')]}>
                                            {isLoading && <ActivityIndicator color={getColorCode('text-blue-500')} style={tailwind('mr-2')} />}
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
                                            keyboardType={'phone-pad'}
                                            placeholder={translate('Auth.LoginScreen.codeInputPlaceholder')}
                                            placeholderTextColor={'rgba(156, 163, 175, 1)'}
                                            style={[tailwind('form-input flex flex-row text-gray-100 text-center mb-2'), config('ui.loginScreen.verifyCodeInputStyle')]}
                                            {...(config('ui.loginScreen.verifyCodeInputProps') ?? {})}
                                        />
                                        <View style={tailwind('flex flex-row justify-end w-full')}>
                                            <TouchableOpacity style={config('ui.loginScreen.retryButtonStyle')} onPress={retry}>
                                                <Text style={[tailwind('text-blue-200 font-semibold'), config('ui.loginScreen.retryButtonTextStyle')]}>
                                                    {translate('Auth.LoginScreen.retryButtonText')}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    <TouchableOpacity onPress={verifyCode}>
                                        <View style={[tailwind('btn bg-gray-900 border border-gray-700'), config('ui.loginScreen.verifyCodeButtonStyle')]}>
                                            {isLoading && <ActivityIndicator color={getColorCode('text-blue-500')} style={tailwind('mr-2')} />}
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
