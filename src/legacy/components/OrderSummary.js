import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faEye } from '@fortawesome/free-solid-svg-icons';
import { tailwind } from 'tailwind';
import { format } from 'date-fns';
import { isEmpty, getDistance } from 'utils';
import Collapsible from 'react-native-collapsible';

const OrderSummary = ({ order, onPress, wrapperStyle, containerStyle }) => {
    const [isCollapsed, setIsCollapsed] = useState(true);

    const collapse = () => {
        setIsCollapsed(!isCollapsed);
    };

    return (
        <View style={[tailwind('overflow-hidden'), wrapperStyle]}>
            <View style={[tailwind('w-full'), containerStyle]} onPress={onPress}></View>
        </View>
    );
};

export default OrderSummary;
