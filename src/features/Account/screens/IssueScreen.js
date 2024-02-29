import { Place } from '@fleetbase/sdk';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import React, { useState } from 'react';
import { useDriver } from 'hooks';
import { IssuePriority, IssueCategory, IssueType } from 'constant/Enum';
import DropDownPicker from 'react-native-dropdown-picker';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import tailwind from 'tailwind';

import { getColorCode, translate } from 'utils';

const IssueScreen = ({ navigation }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [driver, setDriver] = useDriver();

    const [issueType, setIssueType] = useState('');
    const [category, setCategory] = useState('');
    const [priority, setPriority] = useState('');
    const [report, setReport] = useState('');

    // const [destination] = useState(new Place(_destination, fleetbase.getAdapter()));
    // const coords = {
    //     destination: destination?.getAttribute('location.coordinates'),
    // };

    console.log('IssueCategory;;;', JSON.stringify(IssueCategory));
    const saveIssue = () => {
        setIsLoading(true);

        return adapter
            .post('issues', {
                name,
                email,
                phone,
            })
            .then(driver => {
                setDriver(driver);
                setIsLoading(false);
                navigation.goBack();
            })
            .catch(logError);
    };

    const handleChange = text => {
        setReport(text);
    };

    return (
        <View style={[tailwind('w-full h-full bg-gray-800')]}>
            <Pressable onPress={Keyboard.dismiss} style={tailwind('w-full h-full relative')}>
                <View style={tailwind('flex flex-row items-center justify-between p-4')}>
                    <Text style={tailwind('text-xl text-gray-50 font-semibold')}>{translate('Auth.IssueScreen.issues').slice(0, -1)}</Text>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('mr-4')}>
                        <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                            <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                        </View>
                    </TouchableOpacity>
                </View>
                <View style={tailwind('flex w-full h-full')}>
                    <KeyboardAvoidingView style={tailwind('p-4')}>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Auth.IssueScreen.type')}</Text>
                            <DropDownPicker
                                items={Object.values(IssueType).map(type => ({
                                    label: type,
                                    value: type,
                                }))}
                                defaultValue={''}
                                containerStyle={{ height: 40 }}
                                onChangeItem={item => setIssueType(item.value)}
                            />
                        </View>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Auth.IssueScreen.report')}</Text>
                            <TextInput
                                value={report}
                                onChangeText={handleChange}
                                numberOfLines={4}
                                multiline={true}
                                type={'text'}
                                placeholderTextColor={getColorCode('text-gray-600')}
                                style={tailwind('form-input text-white h-28')}
                            />
                        </View>

                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Auth.IssueScreen.category')}</Text>
                            <DropDownPicker
                                items={Object.values(IssueCategory).map(value => ({
                                    label: value,
                                    value: value,
                                }))}
                                defaultValue={''}
                                containerStyle={{ height: 40 }}
                                onChangeItem={item => setCategory(item.value)}
                                style={{ backgroundColor: 'lightgray' }}
                            />
                        </View>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Auth.IssueScreen.priority')}</Text>
                            <DropDownPicker
                                style={tailwind('bg-gray-200')}
                                items={Object.values(IssuePriority).map(priority => ({
                                    label: priority,
                                    value: priority,
                                }))}
                                defaultValue={''}
                                containerStyle={{ height: 40 }}
                                onChangeItem={item => setIssueType(item.value)}
                            />
                        </View>
                        <TouchableOpacity onPress={'saveProfile'} disabled={isLoading}>
                            <View style={tailwind('btn bg-gray-900 border border-gray-700 mt-4')}>
                                {isLoading && <ActivityIndicator color={getColorCode('text-gray-50')} style={tailwind('mr-2')} />}
                                <Text style={tailwind('font-semibold text-lg text-gray-50 text-center')}>{translate('Auth.IssueScreen.save')}</Text>
                            </View>
                        </TouchableOpacity>
                    </KeyboardAvoidingView>
                </View>
            </Pressable>
        </View>
    );
};

export default IssueScreen;
