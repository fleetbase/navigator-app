/**
 * The small map at the top of an order card — design round 3, order card C.
 *
 * A driver recognises a job by where it goes, so the card leads with the order's
 * real route: the road line from the routing engine, in the colour the console
 * gives this order, with the console's P / D / numbered markers on it. It is a
 * picture, not a control: touches pass through to the card, so the list scrolls
 * and a tap opens the order.
 *
 * The road line comes from the order's tracker. Until it arrives, or when the
 * organisation has no routing engine, the points are joined by a dashed straight
 * line, which is how every map in the app says "not by road".
 */
import { memo, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { YStack } from 'tamagui';
import { StopBadge } from '../../ui/RouteMap';
import { CasedPolyline } from '../../ui/CasedPolyline';
import { colorForId } from '../../ui/routeColors';
import { decodePolyline, type LatLng } from '../../data/routeGeo';
import { useTracker } from '../../data/useTracker';
import { useResolvedScheme } from '../../settings';
import type { OrderPoint } from './model';

export const ORDER_CARD_MAP_HEIGHT = 132;

function OrderCardMapBase({ orderId, points, finished, testID }: { orderId: string; points: OrderPoint[]; /** A finished order's route is drawn in the completed style. */ finished?: boolean; testID?: string }) {
    const ref = useRef<MapView>(null);
    const scheme = useResolvedScheme();
    const dark = scheme !== 'light' && scheme !== 'sunlight';
    const color = colorForId(orderId);
    const located = useMemo(() => points.filter((p): p is OrderPoint & { point: LatLng } => !!p.point), [points]);

    // One tracker read per card on screen; the list only mounts the cards in view.
    const { tracker } = useTracker(finished ? undefined : orderId);
    const route = useMemo(() => decodePolyline(tracker?.route?.polyline), [tracker?.route?.polyline]);
    const straight = useMemo(() => located.map((p) => p.point), [located]);

    const fitKey = `${located.map((p) => `${p.point.latitude},${p.point.longitude}`).join('|')}:${route.length}`;
    useEffect(() => {
        const coordinates = [...straight, ...route];
        if (coordinates.length < 2) return;
        ref.current?.fitToCoordinates(coordinates, { edgePadding: { top: 34, right: 40, bottom: 30, left: 40 }, animated: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey]);

    if (!located.length) return null;

    return (
        <YStack height={ORDER_CARD_MAP_HEIGHT} backgroundColor="$surfaceRaised" testID={testID}>
            {/* Not interactive: the card is the tap target and the list owns the scroll. */}
            <View style={{ flex: 1 }} pointerEvents="none">
                <MapView
                    ref={ref}
                    style={{ flex: 1 }}
                    initialRegion={{ ...located[0].point, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
                    userInterfaceStyle={dark ? 'dark' : 'light'}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    pitchEnabled={false}
                    rotateEnabled={false}
                    showsCompass={false}
                    showsMyLocationButton={false}
                    toolbarEnabled={false}
                    liteMode
                >
                    {route.length > 1 ? (
                        <CasedPolyline coordinates={route} color={color} variant={finished ? 'completed' : 'live'} />
                    ) : straight.length > 1 ? (
                        <Polyline coordinates={straight} strokeColor={color} strokeWidth={3} lineDashPattern={[8, 6]} />
                    ) : null}
                    {located.map((p, index) => {
                        const state = p.state === 'done' ? 'done' : p.state === 'current' ? 'current' : p.state === 'skipped' ? 'skipped' : 'pending';
                        return (
                            <Marker key={`${p.id ?? index}:${state}`} coordinate={p.point} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                                <StopBadge kind={p.role} number={p.waypointNumber ?? index + 1} color={color} state={state} />
                            </Marker>
                        );
                    })}
                </MapView>
            </View>
        </YStack>
    );
}

export const OrderCardMap = memo(OrderCardMapBase);

export default OrderCardMap;
