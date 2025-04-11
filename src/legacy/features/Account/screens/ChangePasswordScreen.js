import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useLocale } from 'hooks';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tailwind from 'tailwind';

const ChangePasswordScreen = ({ navigation, route }) => {
    const insets = useSafeAreaInsets();
    const [locale, setLocale] = useLocale();

    return (
        <View style={[tailwind('w-full h-full bg-white'), { paddingTop: insets.top }]}>
            <View style={tailwind('w-full h-full bg-white relative')}>
                <View style={tailwind('flex flex-row items-center p-4')}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('mr-4')}>
                        <View style={tailwind('rounded-full bg-gray-100 w-10 h-10 flex items-center justify-center')}>
                            <FontAwesomeIcon icon={faTimes} />
                        </View>
                    </TouchableOpacity>
                    <Text style={tailwind('text-xl font-semibold')}>{translate('Account.ChangePasswordScreen.title')}</Text>
                </View>
                <View style={tailwind('flex items-center justify-center w-full h-full')}>
                    <Text>Change Password Screen</Text>
                </View>
            </View>
        </View>
    );
};

export default ChangePasswordScreen;
