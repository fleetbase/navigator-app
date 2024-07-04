import React, { useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import tailwind from 'tailwind';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { useDriver, useFleetbase, useMountedState } from 'hooks';
import { getColorCode, translate } from 'utils';

const IssuesScreen = () => {
    const navigation = useNavigation();
    const isMounted = useMountedState();
    const [driver] = useDriver();
    const fleetbase = useFleetbase();
    const [issues, setIssueList] = useState([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isCreatingIssue, setIsCreatingIssue] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const fetchIssues = async () => {
        setIsLoading(true);
        try {
            const adapter = fleetbase.getAdapter();
            const response = await adapter.get('issues');
            const sortedIssues = response.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setIssueList(sortedIssues);
        } catch (error) {
            console.error('Error fetching issue:', error);
            setIssueList([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchIssues();
    }, []);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            fetchIssues();
        });

        return unsubscribe;
    }, [isMounted]);

    const renderItem = ({ item }) => (
        <View style={tailwind('px-4 py-2')}>
            <TouchableOpacity
                style={tailwind('bg-gray-900 border border-gray-800 rounded-xl shadow-sm w-full p-4')}
                onPress={() => navigation.navigate('IssueScreen', { issue: item, isEdit: true })}>
                <View style={tailwind('flex flex-col mb-3')}>
                    <View style={tailwind('flex-1 mb-1')}>
                        <Text style={tailwind('text-gray-100 font-semibold')}>{translate('Core.IssueScreen.report')}:</Text>
                    </View>
                    <View style={tailwind('')}>
                        <Text style={tailwind('text-gray-100')} numberOfLines={3}>
                            {item.report}
                        </Text>
                    </View>
                </View>
                <View style={tailwind('flex flex-row items-center justify-between mb-2')}>
                    <View style={tailwind('flex-1')}>
                        <Text style={tailwind('text-gray-100 font-semibold')}>{translate('Core.IssueScreen.createdAt')}:</Text>
                    </View>
                    <Text style={tailwind('text-gray-100')}>{format(new Date(item.created_at), 'MM/dd/yyyy HH:mm')}</Text>
                </View>
                <View style={tailwind('flex flex-row items-center justify-between mb-2')}>
                    <View style={tailwind('flex-1')}>
                        <Text style={tailwind('text-gray-100 font-semibold')}>{translate('Core.IssueScreen.driverName')}:</Text>
                    </View>
                    <View style={tailwind('flex-1 flex-col items-end')}>
                        <Text style={tailwind('text-gray-100')}>{item.driver_name}</Text>
                    </View>
                </View>
                <View style={tailwind('flex flex-row items-center justify-between')}>
                    <View style={tailwind('flex-1')}>
                        <Text style={tailwind('text-gray-100 font-semibold')}>{translate('Core.IssueScreen.vehicleName')}:</Text>
                    </View>
                    <View style={tailwind('flex-1 flex-col items-end')}>
                        <Text style={tailwind('text-gray-100')}>{item.vehicle_name}</Text>
                    </View>
                </View>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={tailwind('w-full h-full bg-gray-800 flex-grow')}>
            <View style={tailwind('flex flex-row items-center justify-between px-4 py-2')}>
                <View>
                    <Text style={tailwind('font-bold text-white text-base')}>{translate('Core.IssueScreen.issues')}</Text>
                </View>
            </View>

            <>
                <FlatList
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={fetchIssues} tintColor={getColorCode('text-blue-200')} />}
                    data={issues}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                />
                <View style={tailwind('p-4')}>
                    <View style={tailwind('flex flex-row items-center justify-center')}>
                        <TouchableOpacity
                            style={tailwind('flex-1')}
                            onPress={() => {
                                setIsCreatingIssue(true);
                                navigation.navigate('IssueScreen');
                            }}>
                            <View style={tailwind('btn bg-gray-900 border border-gray-700')}>
                                <Text style={tailwind('font-semibold text-gray-50 text-base')}>{translate('Core.IssueScreen.createIssue')}</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            </>
        </View>
    );
};

export default IssuesScreen;
