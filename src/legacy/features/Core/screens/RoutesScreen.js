import { Collection, Order } from '@fleetbase/sdk';
import OrdersFilterBar from 'components/OrdersFilterBar';
import SimpleOrdersMetrics from 'components/SimpleOrdersMetrics';
import DefaultHeader from 'components/headers/DefaultHeader';
import { format } from 'date-fns';
import { useDriver, useFleetbase, useMountedState, useResourceCollection } from 'hooks';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { tailwind } from 'tailwind';
import { getCurrentLocation, isArray, isEmpty, logError } from 'utils';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.0922;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

const RoutesScreen = ({ navigation }) => {
    const isMounted = useMountedState();
    const fleetbase = useFleetbase();
    const map = useRef();
    const [driver] = useDriver();

    const [date, setDateValue] = useState(new Date());
    const [params, setParams] = useState({
        driver: driver.id,
        on: format(date, 'dd-MM-yyyy'),
    });
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isQuerying, setIsQuerying] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [userLocation, setUserLocation] = useState(null);
    const [stops, setStops] = useState([]);
    const [firstStop, setFirstStop] = useState(null);
    const [orders, setOrders] = useResourceCollection(`orders_${format(date, 'yyyyMMdd')}`, Order, fleetbase.getAdapter());

    const setParam = (key, value) => {
        if (key === 'on') {
            setDateValue(value);
            value = format(value, 'dd-MM-yyyy');
        }

        params[key] = value;
        setParams(params);
    };

    const onRefresh = () => {
        setIsRefreshing(true);

        fleetbase.orders
            .query(params)
            .then(setOrders)
            .catch(logError)
            .finally(() => setIsRefreshing(false));
    };

    const getAllOrderStops = (orders = []) => {
        if (!isArray(orders)) {
            return 0;
        }

        let stops = new Collection();

        for (let index = 0; index < orders.length; index++) {
            const order = orders.objectAt(index);

            if (order.status === 'canceled' || order.status === 'completed' || !order.isAttributeFilled('payload')) {
                continue;
            }

            if (!isEmpty(order.getAttribute('payload.pickup'))) {
                stops.pushObject(order.getAttribute('payload.pickup'));
            }

            const waypoints = order.getAttribute('payload.waypoints', []);

            for (let i = 0; i < waypoints.length; i++) {
                const waypoint = waypoints[i];
                stops.pushObject(waypoints);
            }

            if (!isEmpty(order.getAttribute('payload.dropoff'))) {
                stops.pushObject(order.getAttribute('payload.dropoff'));
            }
        }

        return stops;
    };

    const focusStop = (stop) => {
        if (!stop) {
            return;
        }

        const destination = {
            latitude: stop.location.coordinates[1] - 0.0005,
            longitude: stop.location.coordinates[0],
        };

        const latitudeZoom = 1;
        const longitudeZoom = 1;
        const latitudeDelta = LATITUDE_DELTA / latitudeZoom;
        const longitudeDelta = LONGITUDE_DELTA / longitudeZoom;

        map?.current?.animateToRegion({
            ...destination,
            latitudeDelta,
            longitudeDelta,
        });
    };

    useEffect(() => {
        if (isLoaded) {
            setIsQuerying(true);
        }

        fleetbase.orders
            .query(params)
            .then((orders) => {
                const stops = getAllOrderStops(orders);

                setStops(stops);
                setFirstStop(stops[0] ?? null);

                return orders;
            })
            .then(setOrders)
            .catch(logError)
            .finally(() => {
                setIsQuerying(false);
                setIsLoaded(true);
            });

        getCurrentLocation().then(setUserLocation).catch(logError);
    }, [isMounted, date]);

    useEffect(() => {
        focusStop(firstStop);
    }, [firstStop]);

    // const stops = getAllOrderStops(orders);
    // const firstStop = stops[0] ?? null;
    const canRenderMap = firstStop?.location || userLocation?.position?.coords || userLocation?.coords;

    return (
        <View style={[tailwind('bg-gray-800 h-full')]}>
            <DefaultHeader>
                <OrdersFilterBar
                    onSelectSort={(sort) => setParam('sort', sort)}
                    onSelectFilter={(filters) => setParam('filter', filter)}
                    onSelectDate={(date) => setParam('on', date)}
                    isLoading={isQuerying}
                    containerStyle={tailwind('px-0 pb-0')}
                />
                <SimpleOrdersMetrics orders={orders} date={date} containerClass={tailwind('px-0')} />
            </DefaultHeader>
            {canRenderMap && (
                <MapView
                    ref={map}
                    minZoomLevel={12}
                    maxZoomLevel={20}
                    style={tailwind('w-full h-full rounded-md shadow-sm')}
                    showsUserLocation={true}
                    showsMyLocationButton={true}
                    showsPointsOfInterest={true}
                    showsTraffic={true}
                    initialRegion={{
                        latitude: firstStop ? firstStop?.location?.coordinates[1] : (userLocation?.position?.coords?.latitude ?? userLocation?.coords?.latitude),
                        longitude: firstStop ? firstStop?.location?.coordinates[0] : (userLocation?.position?.coords?.longitude ?? userLocation?.coords?.longitude),
                        latitudeDelta: 1.0922,
                        longitudeDelta: 0.0421,
                    }}
                >
                    {stops.map((waypoint, i) => (
                        <Marker
                            key={i}
                            coordinate={{
                                latitude: waypoint.location.coordinates[1],
                                longitude: waypoint.location.coordinates[0],
                            }}
                        >
                            <View style={tailwind('bg-green-500 shadow-sm rounded-full w-8 h-8 flex items-center justify-center')}>
                                <Text style={tailwind('font-bold text-white')}>{i + 1}</Text>
                            </View>
                        </Marker>
                    ))}
                </MapView>
            )}
        </View>
    );
};

export default RoutesScreen;
