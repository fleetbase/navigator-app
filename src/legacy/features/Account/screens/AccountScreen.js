import { faBuilding, faChevronRight, faIdBadge, faLink, faUser, faFileAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useFleetbase } from 'hooks';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, ImageBackground, Text, TouchableOpacity, View } from 'react-native';
import FastImage from 'react-native-fast-image';
import tailwind from 'tailwind';
import { config, translate } from 'utils';
import { useDriver } from 'utils/Auth';

const fullHeight = Dimensions.get('window').height;

const AccountScreen = ({ navigation }) => {
    const [driver, setDriver] = useDriver();
    const fleetbase = useFleetbase();
    const [currentOrganization, setCurrentOrganization] = useState();
    const [isLoading, setIsLoading] = useState(false);
    const displayHeaderComponent = config(driver ? 'ui.accountScreen.displaySignedInHeaderComponent' : 'ui.accountScreen.displaySignedOutHeaderComponent') ?? true;
    const containerHeight = displayHeaderComponent === true ? fullHeight - 224 : fullHeight;

    const signOut = () => {
        navigation.reset({
            index: 0,
            routes: [{ name: 'BootScreen' }],
        });
        setDriver(null);
    };

    useEffect(() => {
        driver.currentOrganization().then(setCurrentOrganization);
    }, []);

    const RenderBackground = (props) => {
        if (driver) {
            return (
                <ImageBackground
                    source={config('ui.accountScreen.signedInContainerBackgroundImage')}
                    resizeMode={config('ui.accountScreen.signedInBackgroundResizeMode') ?? 'cover'}
                    style={[tailwind('h-full bg-gray-800'), config('ui.accountScreen.signedInContainerBackgroundImageStyle')]}
                >
                    {props.children}
                </ImageBackground>
            );
        }

        return (
            <ImageBackground
                source={config('ui.accountScreen.signedOutContainerBackgroundImage')}
                resizeMode={config('ui.accountScreen.signedOutBackgroundResizeMode') ?? 'cover'}
                style={[tailwind('h-full bg-gray-800'), config('ui.accountScreen.signedOutContainerBackgroundImageStyle')]}
            >
                {props.children}
            </ImageBackground>
        );
    };

    return (
        <RenderBackground>
            <View
                style={[
                    tailwind('bg-gray-800'),
                    config('ui.accountScreen.containerStyle'),
                    driver ? config('ui.accountScreen.signedInContainerStyle') : config('ui.accountScreen.signedOutContainerStyle'),
                    { height: containerHeight },
                ]}
            >
                {!driver && (
                    <View style={tailwind('w-full h-full relative')}>
                        <View style={tailwind('flex items-center justify-center w-full h-full relative')}>
                            {config('ui.accountScreen.displayEmptyStatePlaceholder') === true && (
                                <View style={[tailwind('-mt-20'), config('ui.accountScreen.emptyStatePlaceholderContainerStyle')]}>
                                    <View
                                        style={[
                                            tailwind('flex items-center justify-center mb-10 rounded-full bg-gray-100 w-60 h-60'),
                                            config('ui.accountScreen.emptyStatePlaceholderIconContainerStyle'),
                                        ]}
                                    >
                                        <FontAwesomeIcon icon={faIdBadge} size={88} style={[tailwind('text-gray-600'), config('ui.accountScreen.emptyStatePlaceholderIconStyle')]} />
                                    </View>
                                    <Text style={[tailwind('text-lg text-center font-semibold mb-10'), config('ui.accountScreen.emptyStatePlaceholderTextStyle')]}>
                                        {translate('Account.AccountScreen.title')}
                                    </Text>
                                </View>
                            )}
                            <View style={[tailwind('px-3 flex flex-row w-full'), config('ui.accountScreen.actionButtonsContainerStyle')]}>
                                <View style={tailwind('w-1/2 px-1')}>
                                    <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                                        <View style={[tailwind('btn border border-gray-100 bg-gray-100'), config('ui.accountScreen.loginButtonStyle')]}>
                                            <Text style={[tailwind('font-semibold text-gray-900 text-sm'), config('ui.accountScreen.loginButtonTextStyle')]} numberOfLines={1}>
                                                {translate('Account.AccountScreen.loginButtonText')}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                                <View style={tailwind('w-1/2 px-1')}>
                                    <TouchableOpacity onPress={() => navigation.navigate('CreateAccount')}>
                                        <View style={[tailwind('btn border border-gray-100 bg-gray-100'), config('ui.accountScreen.createAccountButtonStyle')]}>
                                            <Text style={[tailwind('font-semibold text-gray-900 text-sm'), config('ui.accountScreen.createAccountButtonTextStyle')]} numberOfLines={1}>
                                                {translate('Account.AccountScreen.createAccountButtonText')}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </View>
                )}
                {driver && (
                    <View style={tailwind('w-full h-full relative')}>
                        <View style={tailwind('p-4 bg-gray-800 border-b border-gray-700 relative')}>
                            <View style={tailwind('flex flex-row')}>
                                <View style={tailwind('mr-3')}>
                                    <FastImage source={{ uri: driver.getAttribute('photo_url') }} style={tailwind('w-14 h-14 rounded-full')} />
                                </View>
                                <View>
                                    <Text style={tailwind('text-lg font-semibold text-gray-50')}>
                                        {translate('Account.AccountScreen.userGreetingTitle', {
                                            driverName: driver.getAttribute('name'),
                                        })}
                                    </Text>
                                    <Text style={tailwind('text-gray-50 mb-1')}>{currentOrganization && currentOrganization.getAttribute('name')}</Text>
                                    <Text style={tailwind('text-gray-50')}>{driver.getAttribute('phone')}</Text>
                                </View>
                            </View>
                        </View>
                        <View style={tailwind('mb-4')}>
                            <View>
                                <TouchableOpacity onPress={() => navigation.navigate('Organization', { currentOrganization })}>
                                    <View style={tailwind('flex flex-row items-center justify-between p-4 border-b border-gray-700')}>
                                        <View style={tailwind('flex flex-row items-center')}>
                                            <FontAwesomeIcon icon={faBuilding} size={18} style={tailwind('mr-3 text-gray-50')} />
                                            <Text style={tailwind('text-gray-50 text-base')}>{translate('Account.AccountScreen.organization')}</Text>
                                        </View>
                                        <View>
                                            <FontAwesomeIcon icon={faChevronRight} size={18} style={tailwind('text-gray-600')} />
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            </View>
                            <View>
                                <TouchableOpacity onPress={() => navigation.navigate('EditProfile', { attributes: driver.serialize() })}>
                                    <View style={tailwind('flex flex-row items-center justify-between p-4 border-b border-gray-700')}>
                                        <View style={tailwind('flex flex-row items-center')}>
                                            <FontAwesomeIcon icon={faUser} size={18} style={tailwind('mr-3 text-gray-50')} />
                                            <Text style={tailwind('text-gray-50 text-base')}>{translate('Account.AccountScreen.profileLinkText')}</Text>
                                        </View>
                                        <View>
                                            <FontAwesomeIcon icon={faChevronRight} size={18} style={tailwind('text-gray-600')} />
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            </View>
                            <View>
                                <TouchableOpacity onPress={() => navigation.navigate('ConfigScreen', { attributes: driver.serialize() })}>
                                    <View style={tailwind('flex flex-row items-center justify-between p-4 border-b border-gray-700')}>
                                        <View style={tailwind('flex flex-row items-center')}>
                                            <FontAwesomeIcon icon={faLink} size={18} style={tailwind('mr-3 text-gray-50')} />
                                            <Text style={tailwind('text-gray-50 text-base')}>{translate('Account.AccountScreen.config')}</Text>
                                        </View>
                                        <View>
                                            <FontAwesomeIcon icon={faChevronRight} size={18} style={tailwind('text-gray-600')} />
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        </View>
                        <View style={tailwind('p-4')}>
                            <View style={tailwind('flex flex-row items-center justify-center')}>
                                <TouchableOpacity style={tailwind('flex-1')} onPress={signOut}>
                                    <View style={tailwind('btn bg-gray-900 border border-gray-700')}>
                                        {isLoading && <ActivityIndicator style={tailwind('mr-2')} />}
                                        <Text style={tailwind('font-semibold text-gray-50 text-base')}>{translate('Account.AccountScreen.signoutButtonText')}</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}
            </View>
        </RenderBackground>
    );
};

export default AccountScreen;
