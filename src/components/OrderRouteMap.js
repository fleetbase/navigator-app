import React, { useRef, useState } from 'react';
import { Dimensions, Text, View } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import MapView, { Marker, PROVIDER_APPLE, PROVIDER_GOOGLE } from 'react-native-maps';
import { googleMapsActions, googleMapsTravelModes, NavigationApps, wazeActions } from 'react-native-navigation-apps';
import { tailwind } from 'tailwind';
import { isEmpty } from 'utils';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.0922;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

const OrderRouteMap = ({ order, onPress, wrapperStyle, containerStyle, onMapReady }) => {
    const map = useRef();
    const isMultiDropOrder = !isEmpty(order.getAttribute('payload.waypoints', []));
    const [mapProvider, setMapProvider] = useState(PROVIDER_GOOGLE);

    const getCurrentLeg = order => {
        const payload = order.getAttribute('payload');
        const { waypoints, current_waypoint } = payload;

        if (!isMultiDropOrder) {
            return false;
        }

        return waypoints.find(waypoint => {
            return waypoint.id === current_waypoint;
        });
    };

    const getFirstWaypoint = order => {
        const payload = order.getAttribute('payload');

        if (payload?.pickup) {
            return payload.pickup;
        }

        const firstWaypoint = payload.waypoints[0] ?? payload?.dropoff;

        if (firstWaypoint) {
            firstWaypoint.completed = firstWaypoint.status_code === 'COMPLETED';
        }

        return firstWaypoint;
    };

    const getLastWaypoint = (order) => {
        const payload = order.getAttribute('payload');

        if (payload?.dropoff) {
            return payload.dropoff;
        }

        const lastWaypoint = payload.waypoints[payload.waypoints.length - 1] ?? null;

        if (lastWaypoint) {
            lastWaypoint.completed = lastWaypoint.status_code === 'COMPLETED';
        }

        return lastWaypoint;
    };

    const getMiddleWaypoints = (order) => {
        const payload = order.getAttribute('payload');
        const { waypoints, pickup, dropoff } = payload;

        if (!pickup && !dropoff && waypoints.length) {
            const middleWaypoints = waypoints.slice(1, waypoints.length - 1);

            middleWaypoints.forEach((waypoint) => {
                waypoint.completed = waypoint.status_code === 'COMPLETED';
            });

            return middleWaypoints;
        }

        return waypoints ?? [];
    };

    const startCall = (phone) => {
        if (phone) {
            Linking.openURL(`tel:${phone}`);
        }
    };

    const currentLeg = getCurrentLeg(order);
    const firstWaypoint = getFirstWaypoint(order);
    const lastWaypoint = getLastWaypoint(order);
    const middleWaypoints = getMiddleWaypoints(order) ?? [];
    const payload = order.getAttribute('payload');

    const initialRegionCoordinates = {
        latitude: firstWaypoint?.location.coordinates[1],
        longitude: firstWaypoint?.location.coordinates[0],
    };

    const openMaps = () => {
        const coordinates = '37.7749,-122.4194';
        Linking.openURL(`maps://app?daddr=${coordinates}&dirflg=d`);
    };

    const mapProviders = [
        { label: 'Google Maps', value: PROVIDER_GOOGLE },
        { label: 'Apple Maps', value: PROVIDER_APPLE },
        { label: 'Waze', value: 'waze' },
    ];

    return (
        <View style={[tailwind(''), wrapperStyle]}>
            <DropDownPicker
                items={mapProviders}
                defaultValue={PROVIDER_GOOGLE}
                containerStyle={{ height: 40, margin: 10 }}
                style={{ backgroundColor: '#fafafa' }}
                itemStyle={{
                    justifyContent: 'flex-start',
                }}
                dropDownStyle={{ backgroundColor: '#fafafa' }}
                onChangeItem={item => setMapProvider(item.value)}
            />

            {mapProvider === PROVIDER_GOOGLE && (
                <MapView
                    ref={map}
                    onMapReady={() => {
                        if (typeof onMapReady === 'function') {
                            onMapReady(map);
                        }
                    }}
                    minZoomLevel={12}
                    maxZoomLevel={20}
                    style={tailwind('w-full h-60 rounded-md shadow-sm')}
                    initialRegion={{
                        ...initialRegionCoordinates,
                        latitudeDelta: 1.0922,
                        longitudeDelta: 0.0421,
                    }}>
                    {firstWaypoint && (
                        <Marker
                            coordinate={{
                                latitude: firstWaypoint.location.coordinates[1],
                                longitude: firstWaypoint.location.coordinates[0],
                            }}>
                            <View style={tailwind('bg-blue-500 shadow-sm rounded-full w-8 h-8 flex items-center justify-center')}>
                                <Text style={tailwind('font-bold text-white')}>1</Text>
                            </View>
                        </Marker>
                    )}

                    {middleWaypoints.map((waypoint, i) => (
                        <Marker
                            key={i}
                            coordinate={{
                                latitude: waypoint.location.coordinates[1],
                                longitude: waypoint.location.coordinates[0],
                            }}>
                            <View style={tailwind('bg-green-500 shadow-sm rounded-full w-8 h-8 flex items-center justify-center')}>
                                <Text style={tailwind('font-bold text-white')}>{i + 2}</Text>
                            </View>
                        </Marker>
                    ))}

                    {lastWaypoint && (
                        <Marker
                            coordinate={{
                                latitude: lastWaypoint.location.coordinates[1],
                                longitude: lastWaypoint.location.coordinates[0],
                            }}>
                            <View style={tailwind('bg-red-500 shadow-sm rounded-full w-8 h-8 flex items-center justify-center')}>
                                <Text style={tailwind('font-bold text-white')}>{middleWaypoints.length + 2}</Text>
                            </View>
                        </Marker>
                    )}
                </MapView>
            )}

            {mapProvider === PROVIDER_APPLE && (
                <MapView
                    style={styles.map}
                    provider={mapProvider}
                    initialRegion={{
                        latitude: 37.7749,
                        longitude: -122.4194,
                        latitudeDelta: 0.0922,
                        longitudeDelta: 0.0421,
                    }}
                />
            )}
            {mapProvider === 'waze' && (
                <NavigationApps
                    modalProps={{ animationType: 'slide', transparent: true }}
                    modalContainerStyle={{ height: 300, width: 300, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' }}
                    modalBtnCloseContainerStyle={{}}
                    modalBtnCloseStyle={{ borderWidth: 1 }}
                    modalBtnCloseTextStyle={{ fontSize: 20 }}
                    modalBtnOpenStyle={{ borderWidth: 1 }}
                    modalBtnOpenTextStyle={{ fontSize: 50, color: 'white' }}
                    modalBtnOpenText={'some text'}
                    modalBtnCloseText={'some text'}
                    iconSize={50}
                    row
                    viewMode="modal"
                    address="some default address to navigate"
                    waze={{ address: '', lat: '', lon: '', action: wazeActions.navigateByAddress }}
                    googleMaps={{ search, lat: '', lon: '', action: googleMapsActions.navigateByAddress, travelMode: googleMapsTravelModes.driving }}
                    maps={{ search, lat: '', lon: '', action: mapsActions.navigateByAddress, travelMode: mapsTravelModes.driving }}
                />
            )}
        </View>
    );
};

export default OrderRouteMap;
