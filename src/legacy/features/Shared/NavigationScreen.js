import { Order, Place } from '@fleetbase/sdk';
import { faLocationArrow, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useDriver, useFleetbase, useLocale, useMountedState } from 'hooks';
import React, { createRef, useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tailwind from 'tailwind';
import { getCurrentLocation, isArray, logError } from 'utils';

const NavigationScreen = ({ navigation, route }) => {
    const { _order, _destination } = route.params;

    const insets = useSafeAreaInsets();
    const isMounted = useMountedState();
    const actionSheetRef = createRef();
    const fleetbase = useFleetbase();
    const [driver, setDriver] = useDriver();
    const [locale] = useLocale();

    const [order, setOrder] = useState(new Order(_order, fleetbase.getAdapter()));
    const [destination, setDestination] = useState(new Place(_destination, fleetbase.getAdapter()));
    const [origin, setOrigin] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const extractOriginCoordinates = useCallback((_origin) => {
        if (_origin?.coordinates && isArray(_origin?.coordinates)) {
            return _origin?.coordinates?.reverse();
        }

        if (_origin?.coords && _origin?.coords?.latitude && _origin?.coords?.longitude) {
            return [_origin?.coords?.longitude, _origin?.coords?.latitude];
        }
    });

    const coords = {
        origin: extractOriginCoordinates(origin),
        destination: destination?.getAttribute('location.coordinates'),
    };

    const isReady = isArray(coords?.origin) && isArray(coords?.destination);

    const trackDriverLocation = useCallback((event) => {
        // const { distanceTraveled, durationRemaining, fractionTraveled, distanceRemaining } = event.nativeEvent;
        const { latitude, longitude } = event.nativeEvent;

        return driver.track({ latitude, longitude }).catch(logError);
    });

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
        </View>
    );
};

export default NavigationScreen;
