import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { IssuePriority, IssueType, Status, IssueCategory } from 'constant/Enum';
import { useDriver, useFleetbase } from 'hooks';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import tailwind from 'tailwind';
import { getColorCode, getCurrentLocation, logError, translate } from 'utils';
import DropdownActionSheet from '../../../components/DropdownActionSheet';
import getIssueCategories from '../../../constant/GetIssueCategoy';

const IssueScreen = ({ navigation, route }) => {
    const issue = route.params;
    const isEdit = route.params;
    const [isLoading, setIsLoading] = useState(false);
    const fleetbase = useFleetbase();
    const [driver] = useDriver();
    const [driverId] = useState(driver.getAttribute('id'));

    const [type, setType] = useState(issue.type);
    const [categories, setCategories] = useState(getIssueCategories('VEHICLE'));
    const [category, setCategory] = useState();
    const [priority, setPriority] = useState();
    const [status, setStatus] = useState();
    const [report, setReport] = useState(issue.report);
    const [error, setError] = useState('');

    useEffect(() => {
        if (issue) {
            setCategory(issue.issue?.category);
            setPriority(issue.issue?.priority);
            setReport(issue.issue?.report);
            setType(issue.issue?.type);
            setStatus(issue.issue?.status);
        }
    }, []);

    useEffect(() => {
        if (!type) return;
        setCategories(getIssueCategories(type));
    }, [type]);

    const saveIssue = () => {
        if (!validateInputs()) {
            return;
        }
        setIsLoading(true);
        const location = getCurrentLocation().then();
        const adapter = fleetbase.getAdapter();

        if (issue.issue?.id) {
            adapter
                .put(`issues/${issue.issue.id}`, {
                    type,
                    category,
                    priority,
                    report,
                    status,
                    location: location,
                    driver: driverId,
                })
                .then(() => {
                    Toast.show({
                        type: 'success',
                        text1: `Successfully updated`,
                    });
                    setIsLoading(false);
                    navigation.goBack();
                })
                .catch(error => {
                    setIsLoading(false);
                    logError(error);
                });
        } else {
            adapter
                .post('issues', {
                    type,
                    category,
                    priority,
                    report,
                    status,
                    location: location,
                    driver: driverId,
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

    const deleteIssues = () => {
        Alert.alert('Confirmation', 'Are you sure you want to delete this issue?', [
            {
                text: 'Cancel',
                style: 'cancel',
            },
            {
                text: 'Delete',
                onPress: () => confirmDelete(),
            },
        ]);
    };

    const confirmDelete = () => {
        const adapter = fleetbase.getAdapter();
        adapter
            .delete(`issues/${issue.issue.id}`)
            .then(() => {
                Toast.show({
                    type: 'success',
                    text1: `Successfully deleted`,
                });
                setIsLoading(false);
                navigation.goBack();
            })
            .catch(error => {
                setIsLoading(false);
                logError(error);
            });
    };

    const validateInputs = () => {
        if (!type || !category || !priority || !status || !report?.trim()) {
            setError('Please enter a required value.');
            return false;
        } else if (report.trim().length === 0) {
            setError('Report cannot be empty.');
            return false;
        }
        setError('');
        return true;
    };

    return (
        <View style={[tailwind('w-full h-full bg-gray-800')]}>
            <Pressable onPress={Keyboard.dismiss} style={tailwind('w-full h-full relative')}>
                <View style={tailwind('flex flex-row items-center justify-between p-4')}>
                    {issue.isEdit ? (
                        <Text style={tailwind('text-xl text-gray-50 font-semibold')}>{translate('Core.IssueScreen.updateIssue')}</Text>
                    ) : (
                        <Text style={tailwind('text-xl text-gray-50 font-semibold')}>{translate('Core.IssueScreen.createIssue')}</Text>
                    )}
                    <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('mr-4')}>
                        <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                            <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                        </View>
                    </TouchableOpacity>
                </View>
                <View style={tailwind('flex w-full h-full')}>
                    <KeyboardAvoidingView style={tailwind('p-4')}>
                        <View style={isEdit.isEdit ? tailwind('flex flex-row items-center justify-between pb-1') : {}}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Core.IssueScreen.type')}</Text>
                            {isEdit.isEdit ? (
                                <Text style={tailwind('text-white')}>{type}</Text>
                            ) : (
                                <DropdownActionSheet
                                    value={type}
                                    items={Object.keys(IssueType).map(type => {
                                        return { label: IssueType[type], value: type };
                                    })}
                                    onChange={setType}
                                    title={translate('Core.IssueScreen.selectType')}
                                />
                            )}

                            {error && !type ? <Text style={tailwind('text-red-500 mb-2')}>{error}</Text> : null}
                        </View>

                        <View style={isEdit.isEdit ? tailwind('flex flex-row items-center justify-between pb-1') : {}}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Core.IssueScreen.category')}</Text>
                            {isEdit.isEdit ? (
                                <Text style={tailwind('text-white')}>{category}</Text>
                            ) : (
                                <DropdownActionSheet
                                    value={category}
                                    items={categories?.map(category => {
                                        return { label: category, value: category };
                                    })}
                                    onChange={setCategory}
                                    title={'Select category'}
                                />
                            )}
                            {error && !category ? <Text style={tailwind('text-red-500 mb-2')}>{error}</Text> : null}
                        </View>
                        <View style={tailwind('mb-4')}>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Core.IssueScreen.issueReport')}</Text>
                            <TextInput
                                value={report}
                                onChangeText={setReport}
                                numberOfLines={4}
                                multiline={true}
                                placeholder={translate('Core.IssueScreen.enterReport')}
                                placeholderTextColor={getColorCode('text-gray-600')}
                                style={tailwind('form-input text-white h-28')}
                            />
                            {error && !report?.trim() ? <Text style={tailwind('text-red-500 mb-2')}>{error}</Text> : null}
                        </View>
                        <View>
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
                        <View>
                            <Text style={tailwind('font-semibold text-base text-gray-50 mb-2')}>{translate('Core.IssueScreen.status')}</Text>
                            <DropdownActionSheet
                                value={status}
                                items={Object.keys(Status).map(status => {
                                    return { label: Status[status], value: status };
                                })}
                                onChange={setStatus}
                                title={translate('Core.IssueScreen.selectStatus')}
                            />

                            {error && !status ? <Text style={tailwind('text-red-500 mb-2')}>{error}</Text> : null}
                        </View>

                        <TouchableOpacity onPress={saveIssue} disabled={isLoading} style={tailwind('flex')}>
                            <View style={tailwind('btn bg-gray-900 border border-gray-700 mt-4 ')}>
                                {isLoading && <ActivityIndicator color={getColorCode('text-gray-50')} style={tailwind('mr-2')} />}
                                <Text style={tailwind('font-semibold text-lg text-gray-50 text-center')}>{translate('Core.IssueScreen.saveIssue')}</Text>
                            </View>
                        </TouchableOpacity>
                        {isEdit.isEdit && (
                            <TouchableOpacity onPress={deleteIssues} disabled={isLoading} style={tailwind('flex')}>
                                <View style={tailwind('btn bg-gray-900 border border-gray-700 mt-4')}>
                                    <Text style={tailwind('font-semibold text-lg text-gray-50 text-center')}>{translate('Core.IssueScreen.deleteIssue')}</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    </KeyboardAvoidingView>
                </View>
            </Pressable>
        </View>
    );
};

export default IssueScreen;
