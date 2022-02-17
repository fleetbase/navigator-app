import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { tailwind } from 'tailwind';
import { format } from 'date-fns';
import { formatDuration, formatKm } from 'utils';
import OrderStatusBadge from './OrderStatusBadge';
import OrderWaypoints from './OrderWaypoints';

const OrderCard = ({ order, onPress, wrapperStyle, containerStyle }) => {
    const scheduledAt = order.isAttributeFilled('scheduled_at') ? format(new Date(order.getAttribute('scheduled_at')), 'PPpp') : null;
    const createdAt = format(new Date(order.getAttribute('created_at')), 'PPpp');

    return (
        <View style={[tailwind('p-2'), wrapperStyle]}>
            <TouchableOpacity style={[tailwind('bg-gray-800 border border-gray-700 rounded-md shadow-sm w-full'), containerStyle]} onPress={onPress}>
                <View style={tailwind('border-b border-gray-700 py-3 px-3 flex flex-row items-start justify-between')}>
                    <View style={tailwind('flex flex-col')}>
                        <Text style={tailwind('text-white font-semibold mb-1')}>{order.id}</Text>
                        <Text style={tailwind('text-gray-50 mb-1')}>{scheduledAt ?? createdAt}</Text>
                        <View style={tailwind('flex flex-row')}>
                            <Text style={tailwind('text-gray-100')}>{formatDuration(order.getAttribute('time'))}</Text>
                            <Text style={tailwind('text-gray-100 mx-1')}>•</Text>
                            <Text style={tailwind('text-gray-100')}>{formatKm(order.getAttribute('distance') / 1000)}</Text>
                        </View>
                    </View>
                    <View style={tailwind('flex flex-col items-start justify-start')}>
                        <OrderStatusBadge status={order.getAttribute('status')} />
                    </View>
                </View>
                <View style={tailwind('px-4 py-2')}>
                    <OrderWaypoints order={order} />
                </View>
            </TouchableOpacity>
        </View>
    );
};

export default OrderCard;
