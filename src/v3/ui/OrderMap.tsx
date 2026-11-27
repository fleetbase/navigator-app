/**
 * An order's map: its stops, the driver, and the road route between them.
 *
 * The route is the server's — `tracker.route.polyline`, from whichever routing
 * engine the organisation uses — so the app asks no directions service itself.
 * When there is none (no engine answered, or the tracker did not load) the stops
 * are joined by a dashed straight line, which reads as "roughly this way" rather
 * than pretending to be the road.
 */
import { mapLook } from './mapLook';
import { useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { YStack, useTheme } from 'tamagui';
import { StopBadge } from './RouteMap';
import { CasedPolyline } from './CasedPolyline';
import type { WaypointMarkerKind } from './routeColors';
import { radius } from '../theme/tokens';
import type { LatLng } from '../data/routeGeo';

export interface OrderMapStop {
    id: string;
    point: LatLng;
    sequence?: number;
    /** What the stop is to the order: decides the marker's letter and colour. */
    kind?: WaypointMarkerKind;
    /** For a waypoint between pickup and drop-off: its number among the order's waypoints. */
    number?: number;
    name?: string | null;
    done?: boolean;
}

export interface OrderMapProps {
    stops: OrderMapStop[];
    /** The stop the driver is heading to. */
    activeStopId?: string;
    /** The road route, decoded. Empty draws the straight-line fallback. */
    route?: LatLng[];
    /** The order's colour (the console's `colorForId` of its public id), for numbered waypoints. */
    routeColor?: string;
    position?: LatLng | null;
    dark?: boolean;
    height?: number;
    testID?: string;
}

export function OrderMap({ stops, activeStopId, route = [], routeColor, position, dark, height = 220, testID = 'order-map' }: OrderMapProps) {
    const theme = useTheme();
    const ref = useRef<MapView>(null);
    const hasRoute = route.length > 1;

    const straight = useMemo(() => {
        const pending = stops.filter((stop) => !stop.done).map((stop) => stop.point);
        return position ? [position, ...pending] : pending;
    }, [stops, position]);

    // Fit once per set of stops and route, not on every position tick.
    const fitKey = `${stops.map((stop) => stop.id).join('|')}:${route.length}`;
    useEffect(() => {
        const coordinates = [...stops.map((stop) => stop.point), ...route, ...(position ? [position] : [])];
        if (!coordinates.length) return;
        ref.current?.fitToCoordinates(coordinates, { edgePadding: { top: 44, right: 44, bottom: 44, left: 44 }, animated: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey]);

    if (!stops.length) return null;

    return (
        <YStack height={height} borderRadius={radius.hero} overflow="hidden" borderWidth={1} borderColor="$border" testID={testID}>
            <MapView
                ref={ref}
                style={{ flex: 1 }}
                initialRegion={{ ...stops[0].point, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
                {...mapLook(dark)}
                showsUserLocation
                showsMyLocationButton={false}
                showsCompass={false}
                toolbarEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
            >
                {hasRoute ? (
                    <CasedPolyline coordinates={route} color={theme.primary?.val as string} />
                ) : straight.length > 1 ? (
                    <Polyline coordinates={straight} strokeColor={theme.primary?.val as string} strokeWidth={4} lineDashPattern={[8, 6]} />
                ) : null}
                {stops.map((stop) => {
                    const state = stop.done ? 'done' : stop.id === activeStopId ? 'current' : 'pending';
                    return (
                        <Marker
                            // The badge is drawn once (`tracksViewChanges` off), so a change of state needs a new marker.
                            key={`${stop.id}:${state}`}
                            coordinate={stop.point}
                            anchor={{ x: 0.5, y: 0.5 }}
                            tracksViewChanges={state === 'current'}
                            testID={`order-marker-${stop.id}`}
                            accessibilityLabel={`${stop.sequence ?? ''} ${stop.name ?? ''}`.trim()}
                        >
                            <StopBadge kind={stop.kind} number={stop.number ?? stop.sequence} color={routeColor} state={state} />
                        </Marker>
                    );
                })}
            </MapView>
        </YStack>
    );
}

export default OrderMap;
