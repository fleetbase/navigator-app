import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import PhoneInput from 'components/PhoneInput';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import tailwind from 'tailwind';
import { getColorCode, translate } from 'utils';

const SignUpScreen = ({ navigation }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [isLoading, setIsLoading] = useState(false);
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
                                value={''}
                                onChangeText={''}
                                keyboardType={'default'}
                                placeholder={translate('Auth.SignUpScreen.driverName')}
                                placeholderTextColor={getColorCode('text-gray-600')}
                                style={tailwind('form-input text-white')}
                            />
                        </View>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Auth.SignUpScreen.email')}</Text>
                            <TextInput
                                value={''}
                                onChangeText={setEmail}
                                keyboardType={'email-address'}
                                placeholder={translate('Auth.SignUpScreen.email')}
                                placeholderTextColor={getColorCode('text-gray-600')}
                                style={tailwind('form-input text-white')}
                            />
                        </View>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Auth.SignUpScreen.document')}</Text>
                            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                                <Image style={{ width: 200, height: 200 }} />
                                <TouchableOpacity>
                                    <View style={{ backgroundColor: 'blue', padding: 10, marginTop: 20 }}>
                                        <Text style={{ color: 'white' }}>Select Image</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Auth.SignUpScreen.phoneNumber')}</Text>
                            <PhoneInput value={''} onChangeText={''} />
                        </View>

                        <TouchableOpacity onPress={'saveProfile'} disabled={isLoading}>
                            <View style={tailwind('btn bg-gray-900 border border-gray-700 mt-14')}>
                                {isLoading && <ActivityIndicator color={getColorCode('text-gray-50')} style={tailwind('mr-2')} />}
                                <Text style={tailwind('font-semibold text-lg text-gray-50 text-center')}>{translate('Auth.SignUpScreen.saveButtonText')}</Text>
                            </View>
                        </TouchableOpacity>
                    </KeyboardAvoidingView>
                </View>
            </Pressable>
        </View>
    );
};

export default SignUpScreen;
