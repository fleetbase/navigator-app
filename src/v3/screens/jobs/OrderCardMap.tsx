/**
 * The small map at the top of an order card — design round 3.
 *
 * It answers one question: how do I get to this order's next waypoint from
 * where I am? So it shows only two things, the driver and that waypoint, with
 * the road between them from the routing engine. The rest of the order is the
 * strip of markers underneath; putting every waypoint on a map this small would
 * shrink the one leg that matters.
 *
 * It is a picture, not a control: touches pass through to the card, so the list
 * scrolls and a tap opens the order.
 *
 * The road line comes from the order's tracker, whose route starts at the
 * driver's last reported position. Until it arrives, or when the organisation
 * has no routing engine, the two points are joined by a dashed straight line,
 * which is how every map in the app says "not by road".
 */
import { mapLook } from '../../ui/mapLook';
import { memo, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { YStack } from 'tamagui';
import { StopBadge } from '../../ui/RouteMap';
import { CasedPolyline } from '../../ui/CasedPolyline';
import { colorForId } from '../../ui/routeColors';
import { decodePolyline, type LatLng } from '../../data/routeGeo';
import { useTracker } from '../../data/useTracker';
import { useDeviceLocation } from '../../shell/LocationContext';
import { useResolvedScheme } from '../../settings';
import type { OrderPoint } from './model';

export const ORDER_CARD_MAP_HEIGHT = 132;

function OrderCardMapBase({ orderId, target, route, testID }: { orderId: string; /** The waypoint the order is heading to next. */ target: OrderPoint; /** The tracker's road route, decoded; empty until it loads. */ route: LatLng[]; testID?: string }) {
    const ref = useRef<MapView>(null);
    const scheme = useResolvedScheme();
    const dark = scheme !== 'light' && scheme !== 'sunlight';
    const color = colorForId(orderId);
    const device = useDeviceLocation();
    const destination = target.point;


    // Where the line starts: the road route's own first point, else the phone's position.
    const from: LatLng | undefined = route.length > 1 ? route[0] : device ? { latitude: device.latitude, longitude: device.longitude } : undefined;

    // Framed on the driver and the next waypoint only; the rest of the route may run off the edge.
    const fitKey = destination ? `${destination.latitude},${destination.longitude}:${from ? `${from.latitude.toFixed(3)},${from.longitude.toFixed(3)}` : ''}:${route.length > 1}` : '';
    useEffect(() => {
        if (!destination) return;
        if (!from) {
            ref.current?.animateToRegion({ ...destination, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 0);
            return;
        }
        ref.current?.fitToCoordinates([from, destination], { edgePadding: { top: 40, right: 48, bottom: 34, left: 48 }, animated: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey]);

    if (!destination) return null;

    return (
        <YStack height={ORDER_CARD_MAP_HEIGHT} backgroundColor="$surfaceRaised" testID={testID}>
            {/* Not interactive: the card is the tap target and the list owns the scroll. */}
            <View style={{ flex: 1 }} pointerEvents="none">
                <MapView
                    ref={ref}
                    style={{ flex: 1 }}
                    initialRegion={{ ...destination, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
                    {...mapLook(dark)}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    pitchEnabled={false}
                    rotateEnabled={false}
                    showsCompass={false}
                    showsMyLocationButton={false}
                    showsUserLocation
                    toolbarEnabled={false}
                    liteMode
                >
                    {route.length > 1 ? (
                        <CasedPolyline coordinates={route} color={color} variant="live" />
                    ) : from ? (
                        <Polyline coordinates={[from, destination]} strokeColor={color} strokeWidth={3} lineDashPattern={[8, 6]} />
                    ) : null}
                    <Marker key={`${target.id ?? 'target'}:${target.role}`} coordinate={destination} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                        <StopBadge kind={target.role} number={target.waypointNumber} color={color} state="current" />
                    </Marker>
                </MapView>
            </View>
        </YStack>
    );
}

export const OrderCardMap = memo(OrderCardMapBase);

/**
 * One tracker read per card on screen (the list only mounts the cards in view),
 * shared by the map and the footer: the road route, and the distance left on it.
 */
export function useOrderCardRoute(orderId?: string): { route: LatLng[]; remainingM?: number } {
    const { tracker } = useTracker(orderId);
    const route = useMemo(() => decodePolyline(tracker?.route?.polyline), [tracker?.route?.polyline]);
    const meters = tracker?.progress?.remaining_distance_m ?? tracker?.route?.distance_m;
    return { route, remainingM: typeof meters === 'number' && Number.isFinite(meters) && meters > 0 ? meters : undefined };
}

export default OrderCardMap;
