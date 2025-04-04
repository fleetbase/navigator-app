import React, { useState, useMemo, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, FlatList, Pressable } from 'react-native';
import { Avatar, Text, YStack, XStack, Separator, useTheme } from 'tamagui';
import { toast, ToastPosition } from '@backpackapp-io/react-native-toast';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { abbreviateName, navigatorConfig, showActionSheet } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import storage from '../utils/storage';

const DriverProfileScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { t } = useLanguage();
    const { driver, logout, switchOrganization, organizations } = useAuth();

    const handlePressMenuItem = useCallback(
        (item) => {
            if (item && typeof item.handler === 'function') {
                return item.handler(item);
            }

            return navigation.navigate(item.screen);
        },
        [navigation]
    );

    const handleViewProfile = useCallback(() => {
        navigation.navigate('DriverAccount');
    }, [navigation]);

    const handleSelectOrganization = useCallback(async () => {
        const options = [...organizations.map((org) => org.name), t('common.cancel')];
        showActionSheet({
            options,
            cancelButtonIndex: options.length - 1,
            onSelect: async (buttonIndex) => {
                if (buttonIndex !== options.length - 1) {
                    try {
                        const selectedOrganization = organizations[buttonIndex];
                        await switchOrganization(selectedOrganization);
                        toast.success(t('ProfileScreen.organizationChanged', { selectedOrganization: selectedOrganization.name }), {
                            position: ToastPosition.BOTTOM,
                        });
                    } catch (err) {
                        console.warn('Error changing organization:', err);
                    }
                }
            },
        });
    }, [organizations]);

    const menuItems = useMemo(() => {
        const items = [
            { id: '1', title: 'Account', screen: 'DriverAccount' },
            {
                id: '2',
                title: 'Organization',
                handler: () => handleSelectOrganization(),
                rightComponent: (
                    <Text color='$textSecondary' fontSize={13} numberOfLines={1}>
                        {driver.getAttribute('company_name')}
                    </Text>
                ),
            },
        ];

        return items.filter((item) => !item.hidden);
    }, [driver]);

    const renderMenuItem = ({ item }) => (
        <Pressable
            onPress={() => handlePressMenuItem(item)}
            style={({ pressed }) => ({
                backgroundColor: pressed ? theme.secondary.val : theme.background.val,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
            })}
        >
            <XStack alignItems='center' space='$3'>
                {item.leftComponent}
                <Text fontSize='$6' fontWeight='bold' color='$textPrimary' numberOfLines={1}>
                    {item.title}
                </Text>
            </XStack>
            <XStack flex={1} alignItems='center' justifyContent='flex-end' space='$2'>
                {item.rightComponent}
                <FontAwesomeIcon icon={faChevronRight} size={16} color={theme.textSecondary.val} />
            </XStack>
        </Pressable>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
            <YStack flex={1} bg='$background' space='$3' padding='$5'>
                <XStack py='$3' space='$3' alignItems='flex-start' justifyContent='space-between'>
                    <YStack>
                        <Pressable onPress={handleViewProfile}>
                            <Avatar circular size='$4'>
                                <Avatar.Image accessibilityLabel={driver.getAttribute('name')} src={driver.getAttribute('photo_url')} />
                                <Avatar.Fallback delayMs={800} backgroundColor='$primary' textAlign='center' alignItems='center' justifyContent='center'>
                                    <Text fontSize='$8' fontWeight='bold' color='$white' textTransform='uppercase' textAlign='center'>
                                        {abbreviateName(driver.getAttribute('name'))}
                                    </Text>
                                </Avatar.Fallback>
                            </Avatar>
                        </Pressable>
                    </YStack>
                    <YStack flex={1}>
                        <Text fontSize='$7' fontWeight='bold' color='$textPrimary' numberOfLines={1} mb='$1'>
                            {driver.getAttribute('name')}
                        </Text>
                        <Text fontSize='$4' color='$textSecondary' numberOfLines={1}>
                            {driver.getAttribute('company_name')}
                        </Text>
                    </YStack>
                </XStack>
                <YStack borderColor='$borderColorWithShadow' borderWidth={1} borderRadius='$4' overflow='hidden' bg='$surface'>
                    <FlatList
                        data={menuItems}
                        keyExtractor={(item) => item.id}
                        renderItem={renderMenuItem}
                        ItemSeparatorComponent={() => <Separator borderBottomWidth={1} borderColor='$borderColorWithShadow' />}
                        scrollEnabled={false}
                        showsVerticalScrollIndicator={false}
                        showsHorizontalScrollIndicator={false}
                    />
                </YStack>
            </YStack>
        </SafeAreaView>
    );
};

export default DriverProfileScreen;
