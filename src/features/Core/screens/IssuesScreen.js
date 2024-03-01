import { useDriver, useFleetbase } from 'hooks';
import React, { useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import tailwind from 'tailwind';
import { useNavigation } from '@react-navigation/native';
import { getColorCode, translate } from 'utils';

const IssuesScreen = () => {
    const navigation = useNavigation();
    const [driver] = useDriver();
    const fleetbase = useFleetbase();
    const [issues, setIssueList] = useState([]);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchIssues = async () => {
        try {
            const adapter = fleetbase.getAdapter();
            const response = await adapter.get('issues');
            setIssueList(response);
            return response;
        } catch (error) {
            console.error('Error fetching  issue:', error);
            return [];
        }
    };

    useEffect(() => {
        fetchIssues();
    }, []);

    const renderItem = ({ item }) => (
        <TouchableOpacity style={tailwind('bg-yellow-900 mb-2')} onPress={() => confirmSwitchIssuestScreen(item.id)}>
            <View style={[tailwind('border-b border-gray-800 py-3 px-3 flex flex-row items-start justify-between')]}>
                <View style={[tailwind('flex flex-col')]}>
                    <Text style={[tailwind('text-white font-semibold mb-1')]}>Title: {item.report}</Text>
                    <View style={[tailwind('flex flex-row')]}>
                        <Text style={[tailwind('text-gray-100')]}>drive name: {item.driver_name}</Text>
                        <Text style={[tailwind('text-gray-100 mx-1')]}>vehicle name: {item.vehicle_name}</Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={tailwind('w-full h-full bg-gray-800 flex-grow')}>
            <View style={tailwind('flex flex-row items-center justify-between p-4 ')}>
                <View>
                    <Text style={tailwind('font-bold text-white text-base')}>Issues</Text>
                </View>
            </View>

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
                            navigation.navigate('IssueScreen');
                        }}>
                        <View style={tailwind('btn bg-gray-900 border border-gray-700')}>
                            <Text style={tailwind('font-semibold text-gray-50 text-base')}>{translate('Account.AccountScreen.create')}</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

export default IssuesScreen;
