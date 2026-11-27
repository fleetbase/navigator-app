/**
 * An order's map: its stops, the driver, and the road route between them.
 *
 * The route is the server's — `tracker.route.polyline`, from whichever routing
 * engine the organisation uses — so the app asks no directions service itself.
 * When there is none (no engine answered, or the tracker did not load) the stops
 * are joined by a dashed straight line, which reads as "roughly this way" rather
 * than pretending to be the road.
 *
 * Two shapes:
 *
 *   - a card (the default): a fixed-height block inside a scrolling screen;
 *   - `fill`: the whole background of the order screen, behind its floating
 *     buttons and its sheet, built the way Home's map is (see home/HomeMap).
 *     `padding` says which part of it can be seen, so the fitted view lands
 *     there; it is fitted only once the map says it is ready (a fit asked for
 *     earlier is dropped without a word); and the driver is the app's own puck
 *     rather than the system's blue dot.
 */
import { mapLook } from './mapLook';
import { DriverPuck } from './DriverPuck';
import { useEffect, useMemo, useRef, useState } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { YStack, useTheme } from 'tamagui';
import { StopBadge } from './RouteMap';
import { CasedPolyline } from './CasedPolyline';
import type { WaypointMarkerKind } from './routeColors';
import { radius } from '../theme/tokens';
import type { LatLng } from '../data/routeGeo';

/** With one point to show, a few streets around it. */
const STREET = { latitudeDelta: 0.0025, longitudeDelta: 0.0025 };

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
    position?: (LatLng & { heading?: number }) | null;
    dark?: boolean;
    height?: number;
    /** Fill the parent instead of drawing a card: the order screen's background. */
    fill?: boolean;
    /** `fill` only: the part of the map covered at the top (floating buttons) and at the bottom (the sheet). */
    padding?: { top?: number; bottom?: number };
    testID?: string;
}

export function OrderMap({ stops, activeStopId, route = [], routeColor, position, dark, height = 220, fill, padding, testID = 'order-map' }: OrderMapProps) {
    const theme = useTheme();
    const ref = useRef<MapView>(null);
    const hasRoute = route.length > 1;
    const [ready, setReady] = useState(false);
    const fitted = useRef(false);
    const padTop = padding?.top ?? 0;
    const padBottom = padding?.bottom ?? 0;

    const straight = useMemo(() => {
        const pending = stops.filter((stop) => !stop.done).map((stop) => stop.point);
        return position ? [position, ...pending] : pending;
    }, [stops, position]);

    // Fit once per set of stops and route, not on every position tick.
    const fitKey = `${stops.map((stop) => stop.id).join('|')}:${route.length}`;
    const fillKey = `${fitKey}:${activeStopId}:${position ? 1 : 0}`;
    useEffect(() => {
        if (fill) return;
        const coordinates = [...stops.map((stop) => stop.point), ...route, ...(position ? [position] : [])];
        if (!coordinates.length) return;
        ref.current?.fitToCoordinates(coordinates, { edgePadding: { top: 44, right: 44, bottom: 44, left: 44 }, animated: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey, fill]);

    // The full-screen map shows the whole order and the driver, in the part above the sheet.
    useEffect(() => {
        if (!fill || !ready) return;
        const coordinates = [...stops.map((stop) => stop.point), ...route, ...(position ? [position] : [])];
        if (!coordinates.length) return;
        // One point has no extent to fit; a street-level region around it instead.
        if (coordinates.length === 1) {
            ref.current?.animateToRegion({ latitude: coordinates[0].latitude, longitude: coordinates[0].longitude, ...STREET }, fitted.current ? 300 : 0);
            fitted.current = true;
            return;
        }
        // The room for the buttons and the sheet is the map's own padding (below), so this is only breathing space.
        ref.current?.fitToCoordinates(coordinates, { edgePadding: { top: 44, right: 48, bottom: 44, left: 48 }, animated: fitted.current });
        fitted.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fill, ready, fillKey, padTop, padBottom]);

    if (!stops.length) {
        // As a background the map always takes its place: a plain block in the map's own colour.
        return fill ? <YStack flex={1} backgroundColor="$mapBackground" testID={`${testID}-empty`} /> : null;
    }

    const frame = fill
        ? ({ flex: 1, backgroundColor: '$mapBackground' } as const)
        : ({ height, borderRadius: radius.hero, overflow: 'hidden', borderWidth: 1, borderColor: '$border' } as const);

    return (
        <YStack {...frame} testID={testID}>
            <MapView
                ref={ref}
                style={{ flex: 1 }}
                onMapReady={() => setReady(true)}
                mapPadding={fill ? { top: padTop, right: 0, bottom: padBottom, left: 0 } : undefined}
                initialRegion={{ ...stops[0].point, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
                {...mapLook(dark)}
                showsUserLocation={!fill}
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
                {fill && position ? (
                    // The driver, drawn by the app: pulsing, and pointing the way they are heading.
                    <Marker coordinate={{ latitude: position.latitude, longitude: position.longitude }} anchor={{ x: 0.5, y: 0.5 }} flat zIndex={5} tracksViewChanges testID="order-driver">
                        <DriverPuck color={theme.primary?.val as string} heading={position.heading} />
                    </Marker>
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
