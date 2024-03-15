import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useNavigation } from '@react-navigation/native';
import { useFleetbase } from 'hooks';
import { React, useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import tailwind from 'tailwind';
import { getColorCode, translate } from 'utils';

const SettingsScreen = ({ route }) => {
    const routeParam = route.params;
    console.log('route---->', JSON.stringify(routeParam));
    const fleetbase = useFleetbase('int/v1');
    const navigation = useNavigation();
    const [isLoading, setIsLoading] = useState(false);
    const [editableFields, setEditableFields] = useState([]);
    const [value, setValue] = useState();

    useEffect(() => {
        setValue(routeParam.data);
    }, [routeParam.data]);

    const fetchSettings = async () => {
        setIsLoading(true);
        try {
            const adapter = fleetbase.getAdapter();
            const settingsResult = await adapter.get('fleet-ops/settings/entity-editing-settings');
            console.log('seting', JSON.stringify(settingsResult));
            const editableEntityFields = Object.values(settingsResult.entityEditingSettings)[0]?.editable_entity_fields;
            setEditableFields(editableEntityFields);
            console.log('editableEntityFields-----?', editableEntityFields);
        } catch (error) {
            console.error('Error', error);
        } finally {
            setIsLoading(false);
        }
    };

    const saveEntitySettings = () => {
        setIsLoading(true);
        const adapter = fleetbase.getAdapter();
        {
            const result = adapter
                .update(`entities/${routeParam.data.id}`, {
                    editableFields,
                })
                .then(() => {
                    Toast.show({
                        type: 'success',
                        text1: `Successfully created`,
                    });
                    setIsLoading(false);
                    navigation.goBack();
                })
                .catch(error => {
                    setIsLoading(false);
                    logError(error);
                });
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    return (
        <ScrollView style={[tailwind('w-full h-full bg-gray-800')]}>
            <Pressable onPress={Keyboard.dismiss} style={tailwind('w-full h-full relative')}>
                <View style={tailwind('flex flex-row items-center justify-between p-4')}>
                    <Text style={tailwind('text-xl text-gray-50 font-semibold')}>{translate('Core.SettingsScreen.title')}</Text>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('mr-4')}>
                        <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                            <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                        </View>
                    </TouchableOpacity>
                </View>
                <View style={tailwind('flex w-full h-full')}>
                    {isLoading && <ActivityIndicator color={getColorCode('text-gray-50')} style={tailwind('mr-2')} />}
                    <KeyboardAvoidingView style={tailwind('p-4')}>
                        {editableFields?.map(field => {
                            return (
                                <View style={tailwind('mb-4')} key={field}>
                                    <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate(`Core.SettingsScreen.${field}`)}</Text>
                                    <TextInput
                                        value={value && value[field] !== undefined ? value[field] : ''}
                                        onChangeText={value =>
                                            setValue(prev => ({
                                                ...prev,
                                                [field]: value,
                                            }))
                                        }
                                        keyboardType={'default'}
                                        placeholder={translate('Core.SettingsScreen.name')}
                                        placeholderTextColor={getColorCode('text-gray-600')}
                                        style={tailwind('form-input text-white')}
                                    />
                                </View>
                            );
                        })}
                        <TouchableOpacity onPress={saveEntitySettings} disabled={isLoading} style={tailwind('flex')}>
                            <View style={tailwind('btn bg-gray-900 border border-gray-700 mt-6')}>
                                <Text style={tailwind('font-semibold text-lg text-gray-50 text-center')}>{translate('Core.SettingsScreen.save')}</Text>
                            </View>
                        </TouchableOpacity>
                    </KeyboardAvoidingView>
                </View>
            </Pressable>
        </ScrollView>
    );
};

export default SettingsScreen;
