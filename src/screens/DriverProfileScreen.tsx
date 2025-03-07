import React, { useState, useMemo, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, FlatList, Pressable } from 'react-native';
import { Avatar, Text, YStack, XStack, Separator, useTheme } from 'tamagui';
import { toast, ToastPosition } from '@backpackapp-io/react-native-toast';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { abbreviateName, navigatorConfig } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import storage from '../utils/storage';

const DriverProfileScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { driver, logout } = useAuth();

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

    const menuItems = useMemo(() => {
        const items = [{ id: '1', title: 'Account', screen: 'DriverAccount' }];

        return items.filter((item) => !item.hidden);
    }, []);

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
            <Text fontWeight='bold' fontSize='$6' color='$textPrimary'>
                {item.title}
            </Text>
            <FontAwesomeIcon icon={faChevronRight} size={16} color={theme.textSecondary.val} />
        </Pressable>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
            <YStack flex={1} bg='$background' space='$3' padding='$5'>
                <XStack paddingVertical='$3' justifyContent='space-between'>
                    <YStack>
                        <Text fontSize='$7' fontWeight='bold' color='$textPrimary' numberOfLines={1}>
                            Hi {driver.getAttribute('name')}!
                        </Text>
                    </YStack>
                    <YStack>
                        <Pressable onPress={handleViewProfile}>
                            <Avatar circular size='$7'>
                                <Avatar.Image accessibilityLabel={driver.getAttribute('name')} src={driver.getAttribute('photo_url')} />
                                <Avatar.Fallback backgroundColor='$primary'>
                                    <Text fontSize='$5' fontWeight='bold' color='$white' textTransform='uppercase'>
                                        {abbreviateName(driver.getAttribute('name'))}
                                    </Text>
                                </Avatar.Fallback>
                            </Avatar>
                        </Pressable>
                    </YStack>
                </XStack>
                <YStack borderColor='$borderColorWithShadow' borderWidth={1} borderRadius='$4' overflow='hidden' bg='$surface'>
                    <FlatList
                        data={menuItems}
                        keyExtractor={(item) => item.id}
                        renderItem={renderMenuItem}
                        ItemSeparatorComponent={() => <Separator borderBottomWidth={1} borderColor='$borderColorWithShadow' />}
                    />
                </YStack>
            </YStack>
        </SafeAreaView>
    );
};

export default DriverProfileScreen;
