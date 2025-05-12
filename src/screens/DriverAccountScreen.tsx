import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, FlatList, Pressable, ScrollView, Platform, Linking } from 'react-native';
import { Spinner, Avatar, Text, YStack, XStack, Separator, Button, useTheme } from 'tamagui';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { toast, ToastPosition } from '@backpackapp-io/react-native-toast';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { showActionSheet, abbreviateName } from '../utils';
import { titleize } from '../utils/format';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import useAppTheme from '../hooks/use-app-theme';
import DeviceInfo from 'react-native-device-info';
import storage from '../utils/storage';

const DriverAccountScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { t, language, languages, setLocale } = useLanguage();
    const { userColorScheme, appTheme, changeScheme, schemes, isDarkMode } = useAppTheme();
    const { driver, logout, isSigningOut, updateDriver } = useAuth();
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

    const handleClearCache = () => {
        storage.clearStore();
        toast.success(t('AccountScreen.cacheCleared'), { position: ToastPosition.BOTTOM });
    };

    const handleSignout = () => {
        logout();
        toast.success(t('AccountScreen.signedOut'));
    };

    const handleOpenTermsOfService = async () => {
        const url = 'https://www.fleetbase.io/terms';
        const supported = await Linking.canOpenURL(url);

        if (supported) {
            await Linking.openURL(url);
        } else {
            console.warn(`Can't open URL: ${url}`);
        }
    };

    const handleOpenPrivacyPolicy = async () => {
        const url = 'https://www.fleetbase.io/privacy-policy';
        const supported = await Linking.canOpenURL(url);

        if (supported) {
            await Linking.openURL(url);
        } else {
            console.warn(`Can't open URL: ${url}`);
        }
    };

    const handleChangeProfilePhoto = () => {
        showActionSheet({
            options: [
                t('AccountScreen.changeProfilePhotoOptions.takePhoto'),
                t('AccountScreen.changeProfilePhotoOptions.photoLibrary'),
                t('AccountScreen.changeProfilePhotoOptions.deleteProfilePhoto'),
                t('common.cancel'),
            ],
            cancelButtonIndex: 3,
            destructiveButtonIndex: 2,
            onSelect: (buttonIndex) => {
                switch (buttonIndex) {
                    case 0:
                        launchCamera(
                            {
                                title: t('AccountScreen.changeProfilePhotoOptions.takePhoto'),
                                includeBase64: true,
                                storageOptions: {
                                    skipBackup: true,
                                    path: 'images',
                                },
                            },
                            (response) => {
                                handleUpdateProfilePhoto(response);
                            }
                        );
                        break;
                    case 1:
                        launchImageLibrary(
                            {
                                title: t('AccountScreen.changeProfilePhotoOptions.photoLibrary'),
                                includeBase64: true,
                                storageOptions: {
                                    skipBackup: true,
                                    path: 'images',
                                },
                            },
                            (response) => {
                                handleUpdateProfilePhoto(response);
                            }
                        );
                        break;
                    case 2:
                        handleRemoveProfilePhoto();
                        break;
                    default:
                        console.log('Action canceled');
                        break;
                }
            },
        });
    };

    const handleUpdateProfilePhoto = async (response) => {
        const asset = response.assets[0];
        const { type, base64 } = asset;
        const data = `data:${type};base64,${base64}`;

        setIsUploadingPhoto(true);

        try {
            await updateDriver({ photo: base64 });
            toast.success(t('AccountScreen.photoChanged'));
        } catch (err) {
            console.warn('Error updating driver profile photo', err);
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const handleRemoveProfilePhoto = async () => {
        setIsUploadingPhoto(true);

        try {
            await updateDriver({ photo: 'REMOVE' });
            toast.success(t('AccountScreen.photoRemoved'));
        } catch (err) {
            console.warn('Error removing driver profile photo', err);
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const handleSelectScheme = () => {
        const options = [...schemes.map((scheme) => titleize(scheme)), t('common.cancel')];
        showActionSheet({
            options,
            cancelButtonIndex: options.length - 1,
            onSelect: (buttonIndex) => {
                if (buttonIndex !== options.length - 1) {
                    const selectedScheme = schemes[buttonIndex];
                    changeScheme(selectedScheme);
                    toast.success(t('AccountScreen.schemeChanged', { selectedScheme }), {
                        position: ToastPosition.BOTTOM,
                    });
                }
            },
        });
    };

    const handleLanguageSelect = () => {
        const options = [...languages.map((lang) => lang.native), t('common.cancel')];
        showActionSheet({
            options,
            cancelButtonIndex: options.length - 1,
            onSelect: (buttonIndex) => {
                if (buttonIndex !== options.length - 1) {
                    const selectedLanguage = languages[buttonIndex];
                    setLocale(selectedLanguage.code);
                    toast.success(t('AccountScreen.languageChanged', { selectedLanguage: selectedLanguage.native }), {
                        position: ToastPosition.BOTTOM,
                    });
                }
            },
        });
    };

    // Render an item in the menu
    const renderMenuItem = ({ item }) => (
        <Pressable
            onPress={item.onPress}
            style={({ pressed }) => ({
                backgroundColor: pressed ? theme.secondary.val : theme.background.val,
                paddingVertical: 12,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
            })}
        >
            <XStack alignItems='center' space='$3'>
                {item.leftComponent}
                <Text fontSize='$6' fontWeight='bold' color='$textSecondary'>
                    {item.title}
                </Text>
            </XStack>
            <XStack alignItems='center' space='$2'>
                {item.rightComponent}
                <FontAwesomeIcon icon={faChevronRight} size={16} color={theme.textSecondary.val} />
            </XStack>
        </Pressable>
    );

    // Account menu items
    const accountMenu = [
        {
            title: t('AccountScreen.profilePhoto'),
            rightComponent: isUploadingPhoto ? (
                <Spinner color='$textPrimary' />
            ) : (
                <Avatar circular size='$2'>
                    <Avatar.Image src={driver.getAttribute('photo_url')} />
                    <Avatar.Fallback backgroundColor='$primary'>
                        <Text color='$white' fontWeight='bold'>
                            {abbreviateName(driver.getAttribute('name'))}
                        </Text>
                    </Avatar.Fallback>
                </Avatar>
            ),
            onPress: () => handleChangeProfilePhoto(),
        },
        {
            title: t('AccountScreen.email'),
            rightComponent: (
                <Text color='$textSecondary' opacity={0.5}>
                    {driver.getAttribute('email')}
                </Text>
            ),
            onPress: () => navigation.navigate('EditAccountProperty', { property: { name: t('AccountScreen.email'), key: 'email', component: 'input' } }),
        },
        {
            title: t('AccountScreen.phoneNumber'),
            rightComponent: (
                <Text color='$textSecondary' opacity={0.5}>
                    {driver.getAttribute('phone')}
                </Text>
            ),
            onPress: () => navigation.navigate('EditAccountProperty', { property: { name: t('AccountScreen.phoneNumber'), key: 'phone', component: 'phone-input' } }),
        },
        {
            title: t('AccountScreen.name'),
            rightComponent: (
                <Text color='$textSecondary' opacity={0.5}>
                    {driver.getAttribute('name')}
                </Text>
            ),
            onPress: () => navigation.navigate('EditAccountProperty', { property: { name: t('AccountScreen.name'), key: 'name', component: 'input' } }),
        },
        {
            title: 'Language',
            rightComponent: (
                <Text color='$textSecondary' opacity={0.5}>
                    {language.native}
                </Text>
            ),
            onPress: handleLanguageSelect,
        },
        {
            title: t('AccountScreen.theme'),
            rightComponent: (
                <Text color='$textSecondary' opacity={0.5}>
                    {titleize(userColorScheme)}
                </Text>
            ),
            onPress: handleSelectScheme,
        },
        {
            title: t('AccountScreen.termsOfService'),
            rightComponent: null,
            onPress: handleOpenTermsOfService,
        },
    ];

    // Data Protection menu items
    const dataProtectionMenu = [
        {
            title: t('AccountScreen.privacyPolicy'),
            rightComponent: null,
            onPress: handleOpenPrivacyPolicy,
        },
        {
            title: t('AccountScreen.clearCache'),
            rightComponent: null,
            onPress: handleClearCache,
        },
        // {
        //     title: t('AccountScreen.tracking'),
        //     rightComponent: <Text color='$textSecondary'>Enabled</Text>, // Replace with dynamic value if available
        //     onPress: () => navigation.navigate('TrackingSettings'),
        // },
    ];

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
            <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
                <YStack flex={1} bg='$background' space='$8' pt={Platform.OS === 'android' ? '$10' : '$5'}>
                    <YStack space='$2'>
                        <XStack px='$3' justifyContent='space-between'>
                            <YStack>
                                <Text fontSize='$8' fontWeight='bold' color='$textPrimary' numberOfLines={1}>
                                    {t('AccountScreen.account')}
                                </Text>
                            </YStack>
                            <YStack>
                                <Text fontSize='$3' color='$textSecondary' numberOfLines={1}>
                                    v{DeviceInfo.getVersion()} #{DeviceInfo.getBuildNumber()}
                                </Text>
                            </YStack>
                        </XStack>
                        <FlatList
                            data={accountMenu}
                            keyExtractor={(item) => item.title}
                            renderItem={renderMenuItem}
                            ItemSeparatorComponent={() => <Separator borderBottomWidth={1} borderColor='$borderColorWithShadow' />}
                            scrollEnabled={false}
                            showsVerticalScrollIndicator={false}
                            showsHorizontalScrollIndicator={false}
                        />
                    </YStack>
                    <YStack space='$2'>
                        <YStack px='$3'>
                            <Text color='$textPrimary' fontSize='$8' fontWeight='bold'>
                                {t('AccountScreen.dataProtection')}
                            </Text>
                        </YStack>
                        <FlatList
                            data={dataProtectionMenu}
                            keyExtractor={(item) => item.title}
                            renderItem={renderMenuItem}
                            ItemSeparatorComponent={() => <Separator borderBottomWidth={1} borderColor='$borderColorWithShadow' />}
                            scrollEnabled={false}
                            showsVerticalScrollIndicator={false}
                            showsHorizontalScrollIndicator={false}
                        />
                    </YStack>
                    <YStack padding='$4' mb='$5'>
                        <Button marginTop='$4' bg='$error' borderWidth={1} borderColor='$errorBorder' size='$5' onPress={handleSignout} rounded width='100%'>
                            <Button.Icon>{isSigningOut ? <Spinner color={theme['$errorText'].val} /> : <YStack />}</Button.Icon>
                            <Button.Text color='$errorText' fontWeight='bold'>
                                {t('AccountScreen.signOut')}
                            </Button.Text>
                        </Button>
                    </YStack>
                </YStack>
            </ScrollView>
        </SafeAreaView>
    );
};

export default DriverAccountScreen;
