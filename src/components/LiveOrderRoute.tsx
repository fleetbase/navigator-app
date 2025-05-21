import React, { useState, useRef, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Text, YStack, XStack, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faBuilding, faTruck } from '@fortawesome/free-solid-svg-icons';
import { Driver, Place } from '@fleetbase/sdk';
import { useLocation } from '../contexts/LocationContext';
import { restoreFleetbasePlace, getCoordinates } from '../utils/location';
import { config, last, first } from '../utils';
import { formattedAddressFromPlace } from '../utils/location';
import { toast } from '../utils/toast';
import MapView, { Marker } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import LocationMarker from './LocationMarker';
import DriverMarker from './DriverMarker';
import useFleetbase from '../hooks/use-fleetbase';

// Utility functions
const calculateDeltas = (zoom) => {
    const baseDelta = 0.005;
    return baseDelta * zoom;
};

const calculateZoomLevel = (latitudeDelta) => Math.log2(360 / latitudeDelta);

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

// Reusable marker label component
const MarkerLabel = ({ label, markerOffset, theme, icon }) => (
    <YStack mb={8} px='$2' py='$2' bg='$gray-900' borderRadius='$4' space='$1' shadowColor='$shadowColor' shadowOffset={markerOffset} shadowOpacity={0.25} shadowRadius={3} width={180}>
        <XStack space='$2'>
            <YStack justifyContent='center'>
                <FontAwesomeIcon icon={icon ?? faBuilding} color={theme['$gray-200'].val} size={14} />
            </YStack>
            <YStack flex={1} space='$1'>
                <Text fontSize='$2' color='$gray-200' numberOfLines={1}>
                    {label}
                </Text>
            </YStack>
        </XStack>
    </YStack>
);

const LiveOrderRoute = ({
    children,
    order,
    zoom = 1,
    width = '100%',
    height = '100%',
    mapViewProps,
    markerSize = 'sm',
    edgePaddingTop = 50,
    edgePaddingBottom = 50,
    edgePaddingLeft = 50,
    edgePaddingRight = 50,
    scrollEnabled = true,
    focusCurrentDestination = false,
    ...props
}) => {
    const theme = useTheme();
    const mapRef = useRef(null);
    const { getDriverLocationAsPlace } = useLocation();
    const { adapter } = useFleetbase();

    // Retrieve attributes from the order
    const pickup = order.getAttribute('payload.pickup');
    const dropoff = order.getAttribute('payload.dropoff');
    const waypoints = order.getAttribute('payload.waypoints', []) ?? [];

    const currentDestination = useMemo(() => {
        const currentWaypoint = order.getAttribute('payload.current_waypoint');
        const locations = [pickup, ...waypoints, dropoff].filter(Boolean);
        const destination = locations.find((place) => place?.id === currentWaypoint) ?? locations[0];

        return new Place(destination);
    }, [pickup, dropoff, waypoints, order]);

    // Determine the start waypoint
    const startWaypoint = !pickup && waypoints.length > 0 ? waypoints[0] : pickup;
    let start = focusCurrentDestination ? getDriverLocationAsPlace() : restoreFleetbasePlace(startWaypoint, adapter);

    // Determine the end waypoint.
    const endWaypoint = !dropoff && waypoints.length > 0 && last(waypoints) !== first(waypoints) ? last(waypoints) : dropoff;
    let end = focusCurrentDestination ? currentDestination : restoreFleetbasePlace(endWaypoint, adapter);

    // Get the coordinates for start and end places
    const origin = getPlaceCoords(start);
    const destination = getPlaceCoords(end);

    // Get only the "middle" waypoints (excluding the first and last ones)
    const middleWaypoints = focusCurrentDestination ? [] : waypoints.slice(1, -1).map((waypoint) => ({ coordinate: getPlaceCoords(waypoint), ...waypoint }));

    // Adjust marker size if a bunch of middle waypoints
    markerSize = middleWaypoints.length > 0 ? (middleWaypoints > 3 ? 'xxs' : 'xs') : markerSize;

    // Initial map props
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
            edgePadding: { top: edgePaddingTop, right: edgePaddingRight, bottom: edgePaddingBottom, left: edgePaddingLeft },
            animated: true,
        });
    };

    const focusDriver = ({ coordinates }) => {
        // Note: latitude and longitude should be derived from coordinates
        const { latitude, longitude } = coordinates;
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
                scrollEnabled={scrollEnabled}
                {...mapViewProps}
            >
                {driverAssigned && <DriverMarker driver={driverAssigned} onMovement={focusDriver} />}
                {start && start?.id !== 'driver' && (
                    <Marker coordinate={origin} centerOffset={markerOffset}>
                        <MarkerLabel icon={start?.id === 'driver' ? faTruck : null} label={formattedAddressFromPlace(start)} markerOffset={markerOffset} theme={theme} />
                        <LocationMarker size={markerSize} />
                    </Marker>
                )}
                {middleWaypoints.map((waypoint, idx) => (
                    <Marker key={waypoint.id || idx} coordinate={waypoint.coordinate} centerOffset={markerOffset}>
                        <MarkerLabel label={waypoint.address} markerOffset={markerOffset} theme={theme} />
                        <LocationMarker size={markerSize} />
                    </Marker>
                ))}
                <Marker coordinate={destination} centerOffset={markerOffset}>
                    <MarkerLabel label={formattedAddressFromPlace(end)} markerOffset={{ width: 0, height: 5 }} theme={theme} />
                    <LocationMarker size={markerSize} />
                </Marker>

                {origin && destination && (
                    <MapViewDirections
                        origin={origin}
                        destination={destination}
                        waypoints={middleWaypoints.map(({ coordinate }) => coordinate)}
                        apikey={config('GOOGLE_MAPS_API_KEY')}
                        strokeWidth={4}
                        strokeColor={theme['$blue-500'].val}
                        onReady={fitToRoute}
                    />
                )}
            </MapView>

            <YStack position='absolute' style={{ ...StyleSheet.absoluteFillObject }}>
                {children}
            </YStack>
        </YStack>
    );
};

export default LiveOrderRoute;
