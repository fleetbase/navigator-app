import React, { useState, useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, YStack, XStack, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faBuilding } from '@fortawesome/free-solid-svg-icons';
import { Driver } from '@fleetbase/sdk';
import { restoreFleetbasePlace, getCoordinates } from '../utils/location';
import { config } from '../utils';
import { formattedAddressFromPlace } from '../utils/location';
import MapView, { Marker, Callout } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import LocationMarker from './LocationMarker';
import DriverMarker from './DriverMarker';

const calculateDeltas = (zoom) => {
    const baseDelta = 0.005;
    return baseDelta * zoom;
};

const calculateZoomLevel = (latitudeDelta) => {
    return Math.log2(360 / latitudeDelta);
};

const calculateOffset = (zoomLevel) => {
    const baseOffsetX = 50;
    const baseOffsetY = -700;
    const zoomFactor = 1 / zoomLevel;
    return {
        x: baseOffsetX * zoomFactor,
        y: baseOffsetY * zoomFactor,
    };
};

const getPlaceCoords = (place) => {
    const [latitude, longitude] = getCoordinates(place);
    return { latitude, longitude };
};

const LiveOrderRoute = ({ children, order, zoom = 1, width = '100%', height = '100%', mapViewProps, markerSize = 'sm', YEdgePadding = 50, XEdgePadding = 50, ...props }) => {
    const theme = useTheme();
    const mapRef = useRef(null);
    const start = restoreFleetbasePlace(order.getAttribute('payload.pickup'));
    const end = restoreFleetbasePlace(order.getAttribute('payload.dropoff'));
    const origin = getPlaceCoords(start);
    const destination = getPlaceCoords(end);
    const initialDeltas = calculateDeltas(zoom);
    const [mapRegion, setMapRegion] = useState({
        ...origin,
        latitudeDelta: initialDeltas,
        longitudeDelta: initialDeltas,
    });
    const [zoomLevel, setZoomLevel] = useState(calculateZoomLevel(initialDeltas));
    const markerOffset = calculateOffset(zoomLevel);
    const driverAssigned = order.getAttribute('driver_assigned') ? new Driver(order.getAttribute('driver_assigned')) : null;

    const handleRegionChangeComplete = (region) => {
        setMapRegion(region);
        const newZoomLevel = calculateZoomLevel(region.latitudeDelta);
        setZoomLevel(newZoomLevel);
    };

    const fitToRoute = ({ coordinates }) => {
        mapRef.current.fitToCoordinates(coordinates, {
            edgePadding: { top: YEdgePadding, right: XEdgePadding, bottom: YEdgePadding, left: XEdgePadding },
            animated: true,
        });
    };

    const focusDriver = ({ coordinates }) => {
        mapRef.current.animateToRegion(
            {
                latitude,
                longitude,
                latitudeDelta: initialDeltas,
                longitudeDelta: initialDeltas,
            },
            500
        );
    };

    return (
        <YStack flex={1} position='relative' overflow='hidden' width={width} height={height} {...props}>
            <MapView
                ref={mapRef}
                style={{ ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' }}
                initialRegion={mapRegion}
                onRegionChangeComplete={handleRegionChangeComplete}
                {...mapViewProps}
            >
                {driverAssigned && <DriverMarker driver={driverAssigned} onMovement={focusDriver} />}
                <Marker coordinate={origin} centerOffset={markerOffset}>
                    <YStack
                        mb={8}
                        px='$2'
                        py='$2'
                        bg='$gray-900'
                        borderRadius='$4'
                        space='$1'
                        shadowColor='$shadowColor'
                        shadowOffset={markerOffset}
                        shadowOpacity={0.25}
                        shadowRadius={3}
                        width={180}
                    >
                        <XStack space='$2'>
                            <YStack justifyContent='center'>
                                <FontAwesomeIcon icon={faBuilding} color={theme['$gray-200'].val} size={14} />
                            </YStack>
                            <YStack flex={1} space='$1'>
                                <Text fontSize='$2' color='$gray-200' numberOfLines={1}>
                                    {formattedAddressFromPlace(start)}
                                </Text>
                            </YStack>
                        </XStack>
                    </YStack>
                    <LocationMarker size={markerSize} />
                </Marker>
                <Marker coordinate={destination} centerOffset={markerOffset}>
                    <YStack
                        mb={8}
                        px='$2'
                        py='$2'
                        bg='$gray-900'
                        borderRadius='$4'
                        space='$1'
                        shadowColor='$shadowColor'
                        shadowOffset={{ width: 0, height: 5 }}
                        shadowOpacity={0.25}
                        shadowRadius={3}
                        width={180}
                    >
                        <XStack space='$2'>
                            <YStack justifyContent='center'>
                                <FontAwesomeIcon icon={faBuilding} color={theme['$gray-200'].val} size={14} />
                            </YStack>
                            <YStack flex={1} space='$1'>
                                <Text fontSize='$2' color='$gray-200' numberOfLines={1}>
                                    {formattedAddressFromPlace(end)}
                                </Text>
                            </YStack>
                        </XStack>
                    </YStack>
                    <LocationMarker size={markerSize} />
                </Marker>

                <MapViewDirections
                    origin={origin}
                    destination={destination}
                    apikey={config('GOOGLE_MAPS_API_KEY')}
                    strokeWidth={4}
                    strokeColor={theme['$blue-500'].val}
                    onReady={fitToRoute}
                />
            </MapView>

            <YStack position='absolute' style={{ ...StyleSheet.absoluteFillObject }}>
                {children}
            </YStack>
        </YStack>
    );
};

export default LiveOrderRoute;
