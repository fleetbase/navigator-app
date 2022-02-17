import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { tailwind } from 'tailwind';
import { format } from 'date-fns';

const OrderStatusBadge = ({ status, onPress, wrapperStyle, containerStyle, style, textStyle }) => {

    let statusWrapperStyle = tailwind();
    let statusTextStyle = tailwind();
    
    switch (status) {
        case 'live':
        case 'success':
        case 'operational':
        case 'active':
        case 'created':
            statusWrapperStyle = tailwind('bg-green-100 border-green-300');
            statusTextStyle = tailwind('text-green-800');
            break;

        case 'dispatched':
        case 'assigned':
            statusWrapperStyle = tailwind('bg-indigo-100 border-indigo-300');
            statusTextStyle = tailwind('text-indigo-800');
            break;

        case 'disabled':
        case 'canceled':
        case 'failed':
            statusWrapperStyle = tailwind('bg-red-100 border-red-300');
            statusTextStyle = tailwind('text-red-800');
            break;

        case 'warning':
        case 'preparing':
        case 'pending':
            statusWrapperStyle = tailwind('bg-yellow-100 border-yellow-300');
            statusTextStyle = tailwind('text-yellow-800');
            break;

        case 'enroute':
        case 'driver_enroute':
            statusWrapperStyle = tailwind('bg-orange-100 border-orange-300');
            statusTextStyle = tailwind('text-orange-800');
            break;

        case 'info':
        case 'in_progress':
            statusWrapperStyle = tailwind('bg-blue-100 border-blue-300');
            statusTextStyle = tailwind('text-blue-800');
            break;

        default:
            break;
    }

    return (
        <View style={[tailwind('flex'), wrapperStyle]}>
            <TouchableOpacity style={[tailwind('border rounded-md'), statusWrapperStyle, containerStyle]} onPress={onPress}>
                <View style={[tailwind('px-4 py-1 flex flex-row items-center justify-center'), style]}>
                    <Text style={[statusTextStyle, textStyle]}>{status}</Text>
                </View>
            </TouchableOpacity>
        </View>
    );
};

export default OrderStatusBadge;
