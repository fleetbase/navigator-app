import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useNavigation } from '@react-navigation/native';
import PhoneInput from 'components/PhoneInput';
import { useFleetbase } from 'hooks';
import React, { useState } from 'react';
import { getColorCode, logError, translate } from 'utils';

import { Keyboard, KeyboardAvoidingView, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import tailwind from 'tailwind';

const SignUpScreen = ({ route }) => {
    const { item } = route.params;
    const fleetbase = useFleetbase();
    const navigation = useNavigation();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState(null);
    const [error, setError] = useState();
    const [isLoading, setIsLoading] = useState(false);

    const saveDriver = () => {
        if (!validateInputs()) {
            return;
        }
        const adapter = fleetbase.getAdapter();
        adapter
            .post('drivers', {
                name,
                email,
                phone,
                company_uuid: item.id,
            })
            .then(() => {
                Toast.show({
                    type: 'success',
                    text1: `Successfully created`,
                });
                navigation.goBack();
                setIsLoading(false);
                navigation.goBack();
            })
            .catch((error) => {
                setIsLoading(false);
                Toast.show({
                    type: 'error',
                    text1: 'error',
                });
                logError(error);
            });
    };

    const validateInputs = () => {
        if (!name || !phone || !email) {
            setError('Please enter a required values.');
            return false;
        }
        setError('');
        return true;
    };

    return (
        <View style={[tailwind('w-full h-full bg-gray-800')]}>
            <Pressable onPress={Keyboard.dismiss} style={tailwind('w-full h-full relative')}>
                <View style={tailwind('flex flex-row items-center justify-between p-4')}>
                    <Text style={tailwind('text-xl text-gray-50 font-semibold')}>{translate('Auth.SignUpScreen.sign')}</Text>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('mr-4')}>
                        <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                            <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                        </View>
                    </TouchableOpacity>
                </View>
                <View style={tailwind('flex w-full h-full')}>
                    <KeyboardAvoidingView style={tailwind('p-4')}>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Auth.SignUpScreen.driverName')}</Text>
                            <TextInput
                                value={name}
                                onChangeText={setName}
                                keyboardType={'default'}
                                placeholder={translate('Auth.SignUpScreen.driverName')}
                                placeholderTextColor={getColorCode('text-gray-600')}
                                style={tailwind('form-input text-white')}
                            />
                            {error && !name ? <Text style={tailwind('text-red-500 mb-2')}>{error}</Text> : null}
                        </View>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Auth.SignUpScreen.email')}</Text>
                            <TextInput
                                value={email}
                                onChangeText={setEmail}
                                keyboardType={'email-address'}
                                placeholder={translate('Auth.SignUpScreen.email')}
                                placeholderTextColor={getColorCode('text-gray-600')}
                                style={tailwind('form-input text-white')}
                            />
                        </View>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Auth.SignUpScreen.phoneNumber')}</Text>
                            <View style={tailwind('mb-6 flex-row')}>
                                <PhoneInput onChangeValue={setPhone} autoFocus={true} />
                            </View>
                        </View>

                        <View style={tailwind('mb-4')}>
                            <TouchableOpacity onPress={saveDriver}>
                                <View style={tailwind('btn bg-gray-900 border border-gray-700 ')}>
                                    <Text style={tailwind('font-semibold text-lg text-gray-50 text-center')}>{translate('Auth.SignUpScreen.save')}</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Pressable>
        </View>
    );
};

export default SignUpScreen;
