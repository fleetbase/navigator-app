import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { IssueCategory, IssuePriority, IssueType } from 'constant/Enum';
import { useDriver, useFleetbase } from 'hooks';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import tailwind from 'tailwind';
import { getColorCode, getCurrentLocation, logError, translate } from 'utils';
import DropdownActionSheet from '../../../components/DropdownActionSheet';

const IssueScreen = ({ navigation, route }) => {
    const issue = route.params;
    const [isLoading, setIsLoading] = useState(false);
    const fleetbase = useFleetbase();
    const [driver] = useDriver();
    const [driverId] = useState(driver.getAttribute('id'));
    const [vehicleId] = useState(driver.getAttribute('vehicle.id'));

    const [type, setType] = useState(issue.type);
    const [category, setCategory] = useState();
    const [priority, setPriority] = useState();
    const [report, setReport] = useState(issue.report);
    const [error, setError] = useState('');

    useEffect(() => {
        if (issue) {
            setCategory(issue.issue?.category);
            setPriority(issue.issue?.priority);
            setReport(issue.issue?.report);
            setType(issue.issue?.type);
        }
    }, []);

    const saveIssue = () => {
        if (!validateInputs()) {
            return;
        }
        setIsLoading(true);
        const location = getCurrentLocation().then();
        const adapter = fleetbase.getAdapter();

        // Check if issueId is available (assuming issueId is passed as a prop)
        if (issueId.id) {
            // If issueId is available, it means it's an update request
            adapter
                .put(`issues/${issueId}`, {
                    type,
                    category,
                    priority,
                    report,
                    location: location,
                    driver: driverId,
                })
                .then(() => {
                    setIsLoading(false);
                    navigation.goBack();
                })
                .catch(error => {
                    setIsLoading(false);
                    logError(error);
                });
        } else
        {
            // If issueId is not available, it's a new issue creation
            adapter
                .post('issues', {
                    type,
                    category,
                    priority,
                    report,
                    location: location,
                    driver: driverId,
                })
                .then(() => {
                    setIsLoading(false);
                    navigation.goBack();
                })
                .catch(error => {
                    setIsLoading(false);
                    logError(error);
                });
        }
    };

    const validateInputs = () => {
        if (!type || !category || !report.trim() || !priority) {
            setError('Please enter a required value.');
            return false;
        }
        setError('');
        return true;
    };

    return (
        <View style={[tailwind('w-full h-full bg-gray-800')]}>
            <Pressable onPress={Keyboard.dismiss} style={tailwind('w-full h-full relative')}>
                <View style={tailwind('flex flex-row items-center justify-between p-4')}>
                    <Text style={tailwind('text-xl text-gray-50 font-semibold')}>{translate('Core.IssueScreen.issues').slice(0, -1)}</Text>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('mr-4')}>
                        <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                            <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                        </View>
                    </TouchableOpacity>
                </View>
                <View style={tailwind('flex w-full h-full')}>
                    <KeyboardAvoidingView style={tailwind('p-4')}>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Core.IssueScreen.type')}</Text>
                            <DropdownActionSheet
                                value={type}
                                items={Object.keys(IssueType).map(type => {
                                    return { label: IssueType[type], value: type };
                                })}
                                onChange={setType}
                                title={translate('Core.IssueScreen.selectType')}
                            />
                            {error && !type ? <Text style={tailwind('text-red-500 mb-2')}>{error}</Text> : null}
                        </View>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Core.IssueScreen.report')}</Text>
                            <TextInput
                                value={report}
                                onChangeText={setReport}
                                numberOfLines={4}
                                multiline={true}
                                placeholder={translate('Core.IssueScreen.enterReport')}
                                placeholderTextColor={getColorCode('text-gray-600')}
                                style={tailwind('form-input text-white h-28')}
                            />
                            {error && !report.trim() ? <Text style={tailwind('text-red-500 mb-2')}>{error}</Text> : null}
                        </View>

                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Core.IssueScreen.category')}</Text>
                            <DropdownActionSheet
                                value={category}
                                items={Object.keys(IssueCategory).map(category => {
                                    return { label: IssueCategory[category], value: category };
                                })}
                                onChange={setCategory}
                                title={translate('Core.IssueScreen.selectCategory')}
                            />
                            {error && !category ? <Text style={tailwind('text-red-500 mb-2')}>{error}</Text> : null}
                        </View>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Core.IssueScreen.priority')}</Text>
                            <DropdownActionSheet
                                value={priority}
                                items={Object.keys(IssuePriority).map(priority => {
                                    return { label: IssuePriority[priority], value: priority };
                                })}
                                onChange={setPriority}
                                title={translate('Core.IssueScreen.selectPriority')}
                            />
                            {error && !priority ? <Text style={tailwind('text-red-500 mb-2')}>{error}</Text> : null}
                        </View>
                        <TouchableOpacity onPress={saveIssue} disabled={isLoading}>
                            <View style={tailwind('btn bg-gray-900 border border-gray-700 mt-4')}>
                                {isLoading && <ActivityIndicator color={getColorCode('text-gray-50')} style={tailwind('mr-2')} />}
                                <Text style={tailwind('font-semibold text-lg text-gray-50 text-center')}>{translate('Core.IssueScreen.save')}</Text>
                            </View>
                        </TouchableOpacity>
                    </KeyboardAvoidingView>
                </View>
            </Pressable>
        </View>
    );
};

export default IssueScreen;