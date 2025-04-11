import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faSearch, faTimes } from '@fortawesome/free-solid-svg-icons';
import { logError, debounce, stripHtml, translate, getColorCode } from 'utils';
import { useLocale } from 'hooks';
import tailwind from 'tailwind';

const searchButtonStyle = tailwind(`flex flex-row items-center bg-gray-900 border border-gray-800 shadow-sm rounded-lg px-3 pr-2 h-12`);

const SearchButton = ({ wrapperStyle, buttonTitle = 'Search', buttonStyle, buttonIcon = faSearch, buttonIconStyle, onPress, placeholder }) => {
    const [locale] = useLocale();

    return (
        <View style={[wrapperStyle]}>
            <TouchableOpacity onPress={onPress}>
                <View style={[searchButtonStyle, buttonStyle]}>
                    <FontAwesomeIcon icon={buttonIcon} style={[tailwind('mr-2 text-gray-300'), buttonIconStyle]} />
                    <Text style={[tailwind('text-gray-300 text-base'), buttonStyle]}>{buttonTitle}</Text>
                </View>
            </TouchableOpacity>
        </View>
    );
};

export { searchButtonStyle };
export default SearchButton;
