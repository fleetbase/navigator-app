import { faWindowClose, faCheck } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import tailwind from 'tailwind';
import { getColorCode, logError, translate } from 'utils';
import { useDriver } from 'utils/Auth';

const Organization = ({ navigation, route }) => {
    const { currentOrganization } = route.params;
    const [driver] = useDriver();
    const [organizations, setOrganizations] = useState([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const fetchData = () => {
        setIsLoading(true);
        setIsRefreshing(true);
        driver
            .listOrganizations()
            .then(setOrganizations)
            .catch(logError)
            .finally(() => {
                setIsLoading(false);
                setIsRefreshing(false);
            });
    };

    useEffect(() => {
        setIsLoading(true);
        fetchData();
    }, []);

    const switchOrganization = (organizationId) => {
        if (currentOrganization.getAttribute('id') === organizationId) {
            return Alert.alert('Warning', 'This organization already selected');
        }
        return driver
            .switchOrganization(organizationId)
            .then(() => {
                Toast.show({
                    type: 'success',
                    text1: `Switched organization`,
                });

                setTimeout(() => {
                    navigation.reset({
                        index: 0,
                        routes: [{ name: 'AccountScreen' }],
                    });

                    navigation.goBack();
                }, 1500);
            })
            .catch((error) => {
                logError(error);
            });
    };

    const confirmSwitchOrganization = (organizationId) => {
        Alert.alert(
            'Confirmation',
            'Are you sure you want to switch organizations?',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                },
                {
                    text: 'OK',
                    onPress: () => switchOrganization(organizationId),
                },
            ],
            { cancelable: false }
        );
    };

    const renderItem = ({ item }) => (
        <TouchableOpacity onPress={() => confirmSwitchOrganization(item.id)}>
            <View style={[tailwind('p-1')]}>
                <View style={[tailwind('px-4 py-2 flex flex-row items-center justify-between rounded-r-md')]}>
                    <Text style={tailwind('text-gray-50 text-base')} numberOfLines={1}>
                        {item.getAttribute('name')}
                    </Text>
                    {currentOrganization.getAttribute('id') === item.id && <FontAwesomeIcon icon={faCheck} size={15} style={tailwind('text-green-400')} />}
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={tailwind('w-full h-full bg-gray-800 flex-grow')}>
            {isLoading ? (
                <ActivityIndicator size='small' color={getColorCode('bg-gray-800')} style={tailwind('mr-2')} />
            ) : (
                <View style={tailwind('flex flex-row items-center justify-between p-4 ')}>
                    <View>
                        <Text style={tailwind('font-bold text-white text-base')}>{translate('Account.OrganizationScreen.title')}</Text>
                    </View>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('rounded-full ')}>
                        <FontAwesomeIcon size={20} icon={faWindowClose} style={tailwind('text-red-400 ')} />
                    </TouchableOpacity>
                </View>
            )}
            {organizations.length === 0 ? (
                <Text style={tailwind('text-white text-center p-4')}>{translate('Account.OrganizationScreen.empty')}</Text>
            ) : (
                <FlatList
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={fetchData} tintColor={getColorCode('text-blue-200')} />}
                    data={organizations}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                />
            )}
        </View>
    );
};

export default Organization;
