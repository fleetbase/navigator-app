import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ImageBackground, TextInput, TouchableOpacity, Modal, Image, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faMapMarkerAlt, faTimes, faInfoCircle, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { useNavigation } from '@react-navigation/native';
import { Collection } from '@fleetbase/sdk';
import { useResourceCollection } from 'utils/Storage';
import { useLocale, useDriver, useFleetbase } from 'hooks';
import { config, translate, isFalsy, logError } from 'utils';
import { LangPicker, SearchButton } from 'components';
import tailwind from 'tailwind';

const isTruthy = (mixed) => !isFalsy(mixed);

const DefaultHeader = (props) => {
    let {
        onBack,
        backButtonIcon,
        hideSearch,
        hideSearchBar,
        hideCategoryPicker,
        categories,
        searchPlaceholder,
        onSearchButtonPress,
        backgroundImage,
        backgroundImageResizeMode,
        backgroundImageStyle,
        displayLogoText,
        children,
    } = props;

    searchPlaceholder = searchPlaceholder ?? translate('components.interface.headers.DefaultHeader.search');

    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const fleetbase = useFleetbase();

    const [locale] = useLocale();
    const [driver, setDriver] = useDriver();
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState(new Collection());
    const [isOnline, setIsOnline] = useState(isTruthy(driver?.getAttribute('online')));

    const shouldDisplayLogoText = (displayLogoText ?? config('ui.headerComponent.displayLogoText')) === true;

    const toggleOnline = useCallback(() => {
        setIsLoading(true);
        setIsOnline(!isOnline);

        return driver
            .update({ online: !isOnline })
            .then(setDriver)
            .catch(logError)
            .finally(() => setIsLoading(false));
    });

    return (
        <ImageBackground
            source={backgroundImage ?? config('ui.headerComponent.backgroundImage')}
            resizeMode={backgroundImageResizeMode ?? config('ui.headerComponent.backgroundImageResizeMode')}
            style={[
                tailwind('z-50 bg-gray-800 border-b border-gray-700 shadow-lg'),
                { paddingTop: insets.top },
                props.style,
                backgroundImageStyle ?? config('ui.headerComponent.backgroundImageStyle'),
            ]}
        >
            <View style={[tailwind(''), props.wrapperStyle, config('ui.headerComponent.containerStyle')]}>
                <View style={[tailwind('flex flex-row items-center justify-between px-4 py-1 overflow-hidden'), props.innerStyle]}>
                    <View style={tailwind('flex flex-row items-center')}>
                        {onBack && (
                            <TouchableOpacity style={tailwind('mr-2')} onPress={onBack}>
                                <View style={[tailwind('rounded-full bg-gray-50 w-8 h-8 flex items-center justify-center'), props.backButtonStyle ?? {}]}>
                                    <FontAwesomeIcon icon={backButtonIcon ?? faArrowLeft} style={[tailwind('text-gray-900'), props.backButtonIconStyle ?? {}]} />
                                </View>
                            </TouchableOpacity>
                        )}
                        {shouldDisplayLogoText && (
                            <View>
                                <Text style={[tailwind('font-bold text-lg text-gray-50'), props.logoStyle ?? {}]}>Navigator</Text>
                                <Text style={[tailwind('text-xs text-white')]}>v1.1.6</Text>
                            </View>
                        )}
                    </View>
                    <View>
                        <Switch
                            trackColor={{ false: 'rgba(209, 213, 219, 1)', true: 'rgba(52, 211, 153, 1)' }}
                            thumbColor={isOnline ? 'rgba(243, 244, 246, 1)' : 'rgba(243, 244, 246, 1)'}
                            ios_backgroundColor="rgba(209, 213, 219, 1)"
                            onValueChange={toggleOnline}
                            value={isOnline}
                            disabled={isLoading}
                        />
                    </View>
                    <View style={tailwind('flex flex-row')}>
                        {config('ui.headerComponent.displayLocalePicker') === true && config('app.enableTranslations') === true && (
                            <LangPicker wrapperStyle={tailwind('mr-2')} buttonStyle={[config('ui.headerComponent.localePickerStyle')]} />
                        )}
                    </View>
                </View>

                {!hideSearchBar && (
                    <View>
                        {!hideSearch && (
                            <View style={tailwind('px-4 py-2')}>
                                <SearchButton
                                    buttonTitle={searchPlaceholder}
                                    onPress={onSearchButtonPress}
                                    buttonStyle={[config('ui.headerComponent.searchButtonStyle')]}
                                    buttonIconStyle={[config('ui.headerComponent.searchButtonIconStyle')]}
                                    wrapperStyle={[tailwind('')]}
                                />
                            </View>
                        )}
                        <View>{children}</View>
                    </View>
                )}
            </View>
        </ImageBackground>
    );
};

export default DefaultHeader;
