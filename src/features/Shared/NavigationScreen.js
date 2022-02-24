import React, { useState, useEffect, createRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Alert, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faTimes, faLocationArrow } from '@fortawesome/free-solid-svg-icons';
import { Order, Place } from '@fleetbase/sdk';
import { adapter as FleetbaseAdapter } from 'hooks/use-fleetbase';
import { useMountedState, useLocale, useDriver } from 'hooks';
import { getCurrentLocation, formatCurrency, formatKm, formatDistance, calculatePercentage, translate, logError, isEmpty, isArray, getColorCode, titleize, formatMetaValue } from 'utils';
import { format } from 'date-fns';
import MapboxNavigation from '@homee/react-native-mapbox-navigation';
import FastImage from 'react-native-fast-image';
import OrderStatusBadge from 'ui/OrderStatusBadge';
import tailwind from 'tailwind';

const NavigationScreen = ({ navigation, route }) => {
    const { _order, _destination } = route.params;

    const insets = useSafeAreaInsets();
    const isMounted = useMountedState();
    const actionSheetRef = createRef();
    const [driver, setDriver] = useDriver();
    const [locale] = useLocale();

    const [order, setOrder] = useState(new Order(_order, FleetbaseAdapter));
    const [destination, setDestination] = useState(new Place(_destination, FleetbaseAdapter));
    const [origin, setOrigin] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const coords = {
        origin: origin?.coordinates?.reverse(),
        destination: destination?.getAttribute('location.coordinates'),
    };

    const isReady = isArray(coords?.origin) && isArray(coords?.destination);

    const trackDriverLocation = (event) => {
        // const { distanceTraveled, durationRemaining, fractionTraveled, distanceRemaining } = event.nativeEvent;
        const { latitude, longitude } = event.nativeEvent;

        return driver.track({ latitude, longitude }).catch(logError);
    };

    useEffect(() => {
        getCurrentLocation().then(setOrigin).catch(logError);
    }, [isMounted]);

    return (
        <View style={[tailwind('bg-gray-800 h-full')]}>
            <View style={[tailwind('z-50 bg-gray-800 border-b border-gray-900 shadow-lg'), { paddingTop: insets.top }]}>
                <View style={tailwind('flex flex-row items-start justify-between px-4 py-2 overflow-hidden')}>
                    <View style={tailwind('flex-1 flex items-start')}>
                        <View style={tailwind('flex flex-row items-center')}>
                            <FontAwesomeIcon icon={faLocationArrow} style={tailwind('text-blue-100 mr-2')} />
                            <Text style={tailwind('text-xl font-semibold text-blue-100')}>Navigation</Text>
                        </View>
                        <Text style={tailwind('text-gray-50')} numberOfLines={1}>
                            {destination.getAttribute('address')}
                        </Text>
                    </View>
                    <View>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('')}>
                            <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                                <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
            {isReady ? (
                <MapboxNavigation
                    origin={coords.origin}
                    destination={coords.destination}
                    showsEndOfRouteFeedback={true}
                    onLocationChange={trackDriverLocation}
                    onRouteProgressChange={(event) => {
                        const { distanceTraveled, durationRemaining, fractionTraveled, distanceRemaining } = event.nativeEvent;
                    }}
                    onError={(event) => {
                        const { message } = event.nativeEvent;
                    }}
                    onCancelNavigation={() => navigation.goBack()}
                    onArrive={() => {
                        // Called when you arrive at the destination.
                    }}
                />
            ) : (
                <View style={tailwind('flex items-center justify-center h-full w-full bg-gray-600 -mt-14')}>
                    <ActivityIndicator size={'large'} color={getColorCode('text-blue-300')} />
                </View>
            )}
        </View>
    );
};

export default NavigationScreen;
