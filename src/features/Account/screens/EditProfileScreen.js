import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Pressable, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventRegister } from 'react-native-event-listeners';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { useDriver, useLocale } from 'hooks';
import { getLocation } from 'utils/Geo';
import { set } from 'utils/Storage';
import { logError, translate, getColorCode } from 'utils';
import tailwind from 'tailwind';
import PhoneInput from 'components/PhoneInput';

const EditProfileScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const location = getLocation();

    const [locale, setLocale] = useLocale();
    const [driver, setDriver] = useDriver();
    const [name, setName] = useState(driver.getAttribute('name'));
    const [email, setEmail] = useState(driver.getAttribute('email'));
    const [phone, setPhone] = useState(driver.getAttribute('phone'));
    const [isLoading, setIsLoading] = useState(false);

    const saveProfile = () => {
        setIsLoading(true);

        return driver
            .update({
                name,
                email,
                phone,
            })
            .then((driver) => {
                setDriver(driver);
                setIsLoading(false);
                navigation.goBack();
            })
            .catch(logError);
    };

    return (
        <View style={[tailwind('w-full h-full bg-gray-800')]}>
            <Pressable onPress={Keyboard.dismiss} style={tailwind('w-full h-full relative')}>
                <View style={tailwind('flex flex-row items-center justify-between p-4')}>
                    <Text style={tailwind('text-xl text-gray-50 font-semibold')}>{translate('Account.EditProfileScreen.title')}</Text>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('mr-4')}>
                        <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                            <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                        </View>
                    </TouchableOpacity>
                </View>
                <View style={tailwind('flex w-full h-full')}>
                    <KeyboardAvoidingView style={tailwind('p-4')}>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Account.EditProfileScreen.nameLabelText')}</Text>
                            <TextInput
                                value={name}
                                onChangeText={setName}
                                keyboardType={'default'}
                                placeholder={translate('Account.EditProfileScreen.nameLabelText')}
                                placeholderTextColor={getColorCode('text-gray-600')}
                                style={tailwind('form-input text-white')}
                            />
                        </View>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Account.EditProfileScreen.emailLabelText')}</Text>
                            <TextInput
                                value={email}
                                onChangeText={setEmail}
                                keyboardType={'email-address'}
                                placeholder={translate('Account.EditProfileScreen.emailLabelText')}
                                placeholderTextColor={getColorCode('text-gray-600')}
                                style={tailwind('form-input text-white')}
                            />
                        </View>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Account.EditProfileScreen.phoneLabelText')}</Text>
                            <PhoneInput value={phone} onChangeText={setPhone} defaultCountry={location?.country} />
                        </View>
                        <TouchableOpacity onPress={saveProfile} disabled={isLoading}>
                            <View style={tailwind('btn bg-gray-900 border border-gray-700')}>
                                {isLoading && <ActivityIndicator color={getColorCode('text-gray-50')} style={tailwind('mr-2')} />}
                                <Text style={tailwind('font-semibold text-lg text-gray-50 text-center')}>{translate('Account.EditProfileScreen.saveButtonText')}</Text>
                            </View>
                        </TouchableOpacity>
                    </KeyboardAvoidingView>
                </View>
            </Pressable>
        </View>
    );
};

export default EditProfileScreen;
