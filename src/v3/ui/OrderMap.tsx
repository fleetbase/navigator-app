/**
 * An order's map: its stops, the driver, and the road route between them.
 *
 * The route is the server's — `tracker.route.polyline`, from whichever routing
 * engine the organisation uses — so the app asks no directions service itself.
 * When there is none (no engine answered, or the tracker did not load) the stops
 * are joined by a dashed straight line, which reads as "roughly this way" rather
 * than pretending to be the road.
 */
import { useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { YStack, useTheme } from 'tamagui';
import { StopBadge } from './RouteMap';
import { radius } from '../theme/tokens';
import type { LatLng } from '../data/routeGeo';

export interface OrderMapStop {
    id: string;
    point: LatLng;
    sequence?: number;
    name?: string | null;
    done?: boolean;
}

export interface OrderMapProps {
    stops: OrderMapStop[];
    /** The stop the driver is heading to. */
    activeStopId?: string;
    /** The road route, decoded. Empty draws the straight-line fallback. */
    route?: LatLng[];
    position?: LatLng | null;
    dark?: boolean;
    height?: number;
    testID?: string;
}

export function OrderMap({ stops, activeStopId, route = [], position, dark, height = 220, testID = 'order-map' }: OrderMapProps) {
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
                userInterfaceStyle={dark ? 'dark' : 'light'}
                showsUserLocation
                showsMyLocationButton={false}
                showsCompass={false}
                toolbarEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
            >
                {hasRoute ? (
                    <Polyline coordinates={route} strokeColor={theme.primary?.val as string} strokeWidth={5} />
                ) : straight.length > 1 ? (
                    <Polyline coordinates={straight} strokeColor={theme.primary?.val as string} strokeWidth={4} lineDashPattern={[8, 6]} />
                ) : null}
                {stops.map((stop) => (
                    <Marker
                        key={stop.id}
                        coordinate={stop.point}
                        anchor={{ x: 0.5, y: 0.5 }}
                        tracksViewChanges={false}
                        testID={`order-marker-${stop.id}`}
                        accessibilityLabel={`${stop.sequence ?? ''} ${stop.name ?? ''}`.trim()}
                    >
                        <StopBadge sequence={stop.sequence} state={stop.done ? 'done' : stop.id === activeStopId ? 'current' : 'pending'} />
                    </Marker>
                ))}
            </MapView>
        </YStack>
    );
}

export default OrderMap;
