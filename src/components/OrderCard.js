import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { tailwind } from 'tailwind';
import { format } from 'date-fns';
import { formatDuration, formatKm } from 'utils';
import OrderStatusBadge from './OrderStatusBadge';
import OrderWaypoints from './OrderWaypoints';

const OrderCard = ({
    order,
    onPress,
    wrapperStyle,
    containerStyle,
    headerStyle,
    waypointsContainerStyle,
    badgeWrapperStyle,
    badgeProps = {},
    textStyle,
    orderIdStyle,
    dateStyle,
    timeStyle,
    distanceStyle,
    headerTop = null,
    headerBottom = null,
}) => {
    const scheduledAt = order.scheduledAt ? format(order.scheduledAt, 'PPpp') : null;
    const createdAt = order.createdAt ? format(order.createdAt, 'PPpp') : null;

    return (
        <View style={[tailwind('p-2'), wrapperStyle]}>
            <TouchableOpacity style={[tailwind('bg-gray-900 border border-gray-800 rounded-xl shadow-sm w-full'), containerStyle]} onPress={onPress}>
                {headerTop}
                <View style={[tailwind('border-b border-gray-800 py-3 px-3 flex flex-row items-start justify-between'), headerStyle]}>
                    <View style={[tailwind('flex flex-col')]}>
                        <Text style={[tailwind('text-white font-semibold mb-1'), textStyle, orderIdStyle]}>{order.id}</Text>
                        {order.hasAttribute('internal_id') && <Text style={[tailwind('text-gray-50 font-semibold mb-1'), textStyle, orderIdStyle]}>{order.getAttribute('internal_id')}</Text>}
                        <Text style={[tailwind('text-gray-50 mb-1'), textStyle, dateStyle]}>{scheduledAt ?? createdAt}</Text>
                        <View style={[tailwind('flex flex-row'), textStyle]}>
                            <Text style={[tailwind('text-gray-100'), textStyle, timeStyle]}>{formatDuration(order.getAttribute('time'))}</Text>
                            <Text style={[tailwind('text-gray-100 mx-1'), textStyle]}>•</Text>
                            <Text style={[tailwind('text-gray-100'), textStyle, distanceStyle]}>{formatKm(order.getAttribute('distance') / 1000)}</Text>
                        </View>
                        {headerBottom}
                    </View>
                    <View style={[tailwind('flex flex-col items-end justify-start'), badgeWrapperStyle]}>
                        <OrderStatusBadge status={order.getAttribute('status')} {...badgeProps} />
                        {order.getAttribute('status') === 'created' && order.isDispatched && <OrderStatusBadge status={'dispatched'} wrapperStyle={tailwind('mt-1')} />}
                    </View>
                </View>
                <View style={[tailwind('p-4'), waypointsContainerStyle]}>
                    <OrderWaypoints order={order} textStyle={textStyle} />
                </View>
            </TouchableOpacity>
        </View>
    );
};

export default OrderCard;
