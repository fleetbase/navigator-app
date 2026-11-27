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
 *
 * What the full-screen map frames is the leg being driven, not the whole order:
 * the driver, the road to the waypoint being headed to, and that waypoint. The
 * tracker's road runs on through every waypoint still to do, so it is cut at
 * the point nearest the one being headed to; that part is drawn strongly and
 * the rest faintly. Without a position for the driver the view is still that
 * road and that waypoint; with neither a position nor a road it is the waypoint
 * itself, a few streets around it. Only a finished order (`overview`), or one
 * with nothing left to head to, is shown whole.
 *
 * The part of the map that can be seen above the sheet is small, so the view
 * spends none of it on margins it does not need: the map's padding is the
 * sheet and the status bar, and the fit's own padding is just enough to keep a
 * marker whole and clear of the round buttons in the top corners.
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
/**
 * Around what the full-screen map fits. Kept small above and below, where the
 * visible strip of map is short (every point of padding there zooms the view
 * out); wider at the sides, where the round buttons sit in the top corners.
 */
const FIT_PADDING = { top: 26, right: 64, bottom: 22, left: 64 };
/** How long after the map reports ready a fit is repeated, in case it was measured before the map had its padding. */
const SETTLE_MS = 400;

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
    /** `fill` only: the part of the map covered at the top (the status bar) and at the bottom (the sheet). */
    padding?: { top?: number; bottom?: number };
    /** `fill` only: show the whole order rather than the leg being driven (a finished order). */
    overview?: boolean;
    testID?: string;
}

export function OrderMap({ stops, activeStopId, route = [], routeColor, position, dark, height = 220, fill, padding, overview, testID = 'order-map' }: OrderMapProps) {
    const theme = useTheme();
    const ref = useRef<MapView>(null);
    const hasRoute = route.length > 1;
    const [ready, setReady] = useState(false);
    const fitted = useRef(false);
    const readyAt = useRef(0);
    const padTop = padding?.top ?? 0;
    const padBottom = padding?.bottom ?? 0;

    const straight = useMemo(() => {
        const pending = stops.filter((stop) => !stop.done).map((stop) => stop.point);
        return position ? [position, ...pending] : pending;
    }, [stops, position]);

    // The waypoint being headed to: the one named, else the first still to do.
    const active = useMemo(() => stops.find((stop) => stop.id === activeStopId && !stop.done) ?? stops.find((stop) => !stop.done), [stops, activeStopId]);
    /*
     * The road splits where it reaches that waypoint: `leg` is the part being
     * driven now, `beyond` the part that carries on to the waypoints after it.
     */
    const { leg, beyond } = useMemo(() => {
        if (!active || route.length < 2) return { leg: route, beyond: [] as LatLng[] };
        let nearest = 0;
        let best = Infinity;
        route.forEach((point, index) => {
            const distance = (point.latitude - active.point.latitude) ** 2 + (point.longitude - active.point.longitude) ** 2;
            if (distance < best) {
                best = distance;
                nearest = index;
            }
        });
        // A road that ends at this waypoint (it is the last) has nothing beyond it.
        return { leg: route.slice(0, nearest + 1), beyond: nearest < route.length - 1 ? route.slice(nearest) : [] };
    }, [route, active]);

    // Fit once per set of stops and route, not on every position tick.
    const fitKey = `${stops.map((stop) => stop.id).join('|')}:${route.length}`;
    // Everything that arrives late and changes what is framed: the stops (the tracker's replace the order's own), the road, the waypoint headed to, whether there is a position, whether the order is finished.
    const fillKey = `${stops.map((stop) => `${stop.id}${stop.done ? 'd' : ''}`).join('|')}:${route.length}:${leg.length}:${active?.id}:${position ? 1 : 0}:${overview ? 1 : 0}`;
    useEffect(() => {
        if (fill) return;
        const coordinates = [...stops.map((stop) => stop.point), ...route, ...(position ? [position] : [])];
        if (!coordinates.length) return;
        ref.current?.fitToCoordinates(coordinates, { edgePadding: { top: 44, right: 44, bottom: 44, left: 44 }, animated: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey, fill]);

    // The full-screen map frames the leg being driven, in the part above the sheet.
    useEffect(() => {
        if (!fill || !ready) return;
        const here = position ? [{ latitude: position.latitude, longitude: position.longitude }] : [];
        /*
         * With somewhere to head to, the view is the way there: the driver
         * (when the phone knows where they are), the road up to that waypoint
         * (when the server gave one), and the waypoint. With neither a driver
         * nor a road that is the waypoint alone, which is shown at street
         * level below. The whole order is the view only when it is finished or
         * has nothing left to head to.
         */
        const coordinates = active && !overview ? [...here, ...(leg.length > 1 ? leg : []), active.point] : [...stops.map((stop) => stop.point), ...route];
        if (!coordinates.length) return;
        const latitudes = coordinates.map((point) => point.latitude);
        const longitudes = coordinates.map((point) => point.longitude);
        const south = Math.min(...latitudes);
        const north = Math.max(...latitudes);
        const west = Math.min(...longitudes);
        const east = Math.max(...longitudes);
        const fit = (animated: boolean) => {
            // One point, or points a few doors apart (the driver has arrived), have no extent worth fitting: a few streets around them instead.
            if (north - south < STREET.latitudeDelta / 2 && east - west < STREET.longitudeDelta / 2) {
                ref.current?.animateToRegion({ latitude: (north + south) / 2, longitude: (east + west) / 2, ...STREET }, animated ? 300 : 0);
                return;
            }
            // The room for the status bar and the sheet is the map's own padding (below). This keeps a marker whole at the edges and clear of the round buttons in the top corners.
            ref.current?.fitToCoordinates(coordinates, { edgePadding: FIT_PADDING, animated });
        };
        fit(fitted.current);
        fitted.current = true;
        /*
         * A fit asked for as the map reports ready can come before the map has
         * taken its padding and its size in; a fit made then is measured
         * against the whole screen and lands zoomed out, or under the sheet.
         * So a fit made in the map's first moments is asked for once more
         * shortly after, when both are in.
         */
        if (Date.now() - readyAt.current > SETTLE_MS) return;
        const again = setTimeout(() => fit(false), SETTLE_MS);
        return () => clearTimeout(again);
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
                onMapReady={() => {
                    readyAt.current = Date.now();
                    setReady(true);
                }}
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
                    fill && leg.length > 1 ? (
                        <>
                            {/* The road on to the waypoints after this one, behind the leg being driven. */}
                            <CasedPolyline coordinates={beyond} color={theme.primary?.val as string} variant="faint" />
                            <CasedPolyline coordinates={leg} color={theme.primary?.val as string} zIndex={2} />
                        </>
                    ) : (
                        <CasedPolyline coordinates={route} color={theme.primary?.val as string} />
                    )
                ) : straight.length > 1 ? (
                    // No road came back from the tracker: a dashed line that does not pretend to be one.
                    <Polyline coordinates={straight} strokeColor={theme.primary?.val as string} strokeWidth={4} lineDashPattern={[8, 6]} />
                ) : null}
                {fill && position ? (
                    // The driver, drawn by the app: pulsing, and pointing the way they are heading.
                    <Marker coordinate={{ latitude: position.latitude, longitude: position.longitude }} anchor={{ x: 0.5, y: 0.5 }} flat zIndex={5} tracksViewChanges testID="order-driver">
                        <DriverPuck color={theme.primary?.val as string} heading={position.heading} />
                    </Marker>
                ) : null}
                {stops.map((stop) => {
                    // The waypoint the view is framed on is the one marked as headed to (the named one, else the first still to do).
                    const state = stop.done ? 'done' : stop.id === (fill ? active?.id : activeStopId) ? 'current' : 'pending';
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
