/**
 * The dashboard's map: the day's waypoints, the driver, and the way to the
 * next one.
 *
 * It fills the screen behind the dashboard's chips and sheet, and can be
 * panned and zoomed in the part that shows. `refitToken` puts the view back
 * (the dashboard's re-centre button changes it).
 *
 * Lines, strongest first:
 *
 *   - the road to the next waypoint, from the tracker, when the screen passes
 *     one (`route`) — with the rest of the day's road faint behind it;
 *   - otherwise the day's road from the manifest, the part already driven
 *     drawn as done;
 *   - otherwise a dashed straight line, which does not pretend to be the road.
 *
 * The map finds the manifest's road itself from the waypoints it is given, so
 * the screens that show it pass nothing extra. Markers are the console's (see
 * `StopBadge`), numbered within their order and coloured by it.
 *
 * The map is the top of the dashboard in every state, so it always takes its
 * height: with no waypoint to show it centres on the driver, and before there
 * is anything at all to centre on it is a plain block in the map's own colour.
 */
import { DriverPuck } from '../../ui/DriverPuck';
import { mapLook } from '../../ui/mapLook';
import { useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { YStack, useTheme } from 'tamagui';
import { StopBadge, markerKindOf } from '../../ui/RouteMap';
import { CasedPolyline } from '../../ui/CasedPolyline';
import { colorForId } from '../../ui/routeColors';
import { routeRuns, useManifestRecord, useManifestRoute, type LatLng } from '../../data';
import type { HomeWaypoint } from './homeModel';

/** With only the driver to show, a few streets around them: close enough to recognise where they are. */
const STREET = { latitudeDelta: 0.0025, longitudeDelta: 0.0025 };

export interface HomeMapProps {
    waypoints: HomeWaypoint[];
    /** The waypoint being headed to. */
    activeKey?: string;
    /** The road route to it, decoded. Empty draws the straight-line fallback. */
    route?: LatLng[];
    position?: (LatLng & { heading?: number }) | null;
    /** The driver is offline: their mark is grey and still. */
    offline?: boolean;
    dark?: boolean;
    height: number;
    /** The part of the map covered at the top (floating chips) and at the bottom (the sheet). */
    padding?: { top?: number; bottom?: number };
    /** Change it to put the view back on the day (or the leg to the next waypoint). */
    refitToken?: number;
    /** Told when the driver moves the map by hand, so a way back can be offered. */
    onMoved?: () => void;
    testID?: string;
}

export function HomeMap({ waypoints, activeKey, route = [], position, offline, dark, height, padding, refitToken = 0, onMoved, testID = 'home-map' }: HomeMapProps) {
    const theme = useTheme();
    const ref = useRef<MapView>(null);
    const placed = useMemo(() => waypoints.filter((w) => !!w.point) as (HomeWaypoint & { point: LatLng })[], [waypoints]);
    const hasRoute = route.length > 1;

    // The day's road, when the waypoints come from a manifest. Shared with the Jobs map, so it is asked for once.
    const manifestId = useMemo(() => waypoints.find((w) => w.manifestId)?.manifestId, [waypoints]);
    const manifest = useManifestRecord(manifestId);
    const routeStops = useMemo(
        () => waypoints.flatMap((w) => (w.source === 'manifest' && w.stopId ? [{ id: w.stopId, status: w.skipped ? 'skipped' : w.done ? 'completed' : 'pending' }] : [])),
        [waypoints]
    );
    const { route: dayRoute } = useManifestRoute(manifestId, routeStops);
    const dayRuns = useMemo(() => {
        if (!dayRoute) return [];
        const done = new Set(waypoints.flatMap((w) => (w.done && w.stopId ? [w.stopId] : [])));
        return routeRuns(dayRoute, (stopId) => (stopId && done.has(stopId) ? 'done' : 'later'), 'later');
    }, [dayRoute, waypoints]);

    /*
     * What goes inside each marker. The dashboard's model keeps a return leg as
     * a drop-off and does not carry a waypoint's number within its order, so
     * both are read here: from the manifest's own record for a manifest
     * waypoint, and by counting along the order for the rest.
     */
    const marks = useMemo(() => {
        const stops = new Map((manifest?.stops ?? []).map((stop) => [stop.id, stop]));
        const counted = new Map<string, number>();
        // Counted over every waypoint, placed or not, so a waypoint without coordinates still takes its number.
        return new Map(
            waypoints.map((w) => {
                const stop = w.stopId ? stops.get(w.stopId) : undefined;
                let number: number | undefined = typeof stop?.waypoint_index === 'number' ? stop.waypoint_index : undefined;
                if (number == null && w.source === 'order' && w.kind === 'waypoint' && w.orderId) {
                    number = (counted.get(w.orderId) ?? 0) + 1;
                    counted.set(w.orderId, number);
                }
                return [w.key, { kind: markerKindOf(stop?.type) ?? w.kind, number: number ?? w.number }] as const;
            })
        );
    }, [waypoints, manifest?.stops]);

    const straight = useMemo(() => {
        const pending = placed.filter((w) => !w.done).map((w) => w.point);
        return position ? [position, ...pending] : pending;
    }, [placed, position]);

    /*
     * The map fills the screen behind the chips and the sheet. Its padding tells
     * it which part can be seen, so "centre on the driver" and "fit the route"
     * land in the visible part and the driver is never hidden under the sheet.
     */
    const padTop = padding?.top ?? 0;
    const padBottom = padding?.bottom ?? 0;
    const fitted = useRef(false);

    // Fit when the set of waypoints, the route or the visible part changes, not on every position tick.
    const fitKey = `${placed.map((w) => `${w.key}${w.done ? 'd' : ''}`).join('|')}:${activeKey}:${route.length}:${position ? 1 : 0}`;
    useEffect(() => {
        // With a next waypoint the view is the leg to it; without one, the whole day.
        const active = placed.find((w) => w.key === activeKey);
        const focus = active ? [active.point, ...route, ...(position ? [position] : [])] : [];
        const coordinates = focus.length > 1 ? focus : [...placed.map((w) => w.point), ...(position ? [position] : [])];
        if (!coordinates.length) return;
        // One point has no extent to fit; a street-level region around it instead.
        if (coordinates.length === 1) {
            ref.current?.animateToRegion({ latitude: coordinates[0].latitude, longitude: coordinates[0].longitude, ...STREET }, fitted.current ? 300 : 0);
            fitted.current = true;
            return;
        }
        // The room for the chips and the sheet is the map's own padding (below), so this is only breathing space.
        ref.current?.fitToCoordinates(coordinates, { edgePadding: { top: 44, right: 48, bottom: 44, left: 48 }, animated: fitted.current });
        fitted.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey, padBottom, refitToken]);

    const centre = placed[0]?.point ?? position;
    // Nothing to centre on yet: hold the map's place rather than show the whole world.
    if (!centre) return <YStack height={height} backgroundColor="$mapBackground" testID={`${testID}-empty`} />;

    return (
        <YStack height={height} backgroundColor="$mapBackground" testID={testID}>
            <MapView
                ref={ref}
                style={{ flex: 1 }}
                mapPadding={{ top: padTop, right: 0, bottom: padBottom, left: 0 }}
                initialRegion={{ latitude: centre.latitude, longitude: centre.longitude, ...(placed.length ? { latitudeDelta: 0.08, longitudeDelta: 0.08 } : STREET) }}
                {...mapLook(dark)}
                showsMyLocationButton={false}
                showsCompass={false}
                toolbarEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                onPanDrag={onMoved}
            >
                {hasRoute ? (
                    <>
                        {dayRoute ? <CasedPolyline coordinates={dayRoute.coordinates} color={theme.primary?.val as string} variant="faint" /> : null}
                        <CasedPolyline coordinates={route} color={theme.primary?.val as string} zIndex={2} />
                    </>
                ) : dayRuns.length ? (
                    dayRuns.map((run, index) => (
                        <CasedPolyline
                            key={`day-${run.kind}-${index}`}
                            coordinates={run.coordinates}
                            color={(run.kind === 'done' ? theme.success?.val : theme.primary?.val) as string}
                            variant={run.kind === 'done' ? 'completed' : 'live'}
                            zIndex={run.kind === 'done' ? 0 : 1}
                        />
                    ))
                ) : straight.length > 1 ? (
                    <Polyline coordinates={straight} strokeColor={theme.primary?.val as string} strokeWidth={4} lineDashPattern={[8, 6]} />
                ) : null}
                {position ? (
                    // The driver, drawn by the app: pulsing, and pointing the way they are heading.
                    <Marker coordinate={{ latitude: position.latitude, longitude: position.longitude }} anchor={{ x: 0.5, y: 0.5 }} flat zIndex={5} tracksViewChanges testID="home-driver">
                        <DriverPuck color={theme.primary?.val as string} heading={position.heading} muted={offline} />
                    </Marker>
                ) : null}
                {placed.map((w) => {
                    const state = w.skipped ? 'skipped' : w.done ? 'done' : w.key === activeKey ? 'current' : 'pending';
                    const mark = marks.get(w.key);
                    return (
                        <Marker
                            // The badge is drawn once (`tracksViewChanges` off), so a change of state needs a new marker.
                            key={`${w.key}:${state}`}
                            coordinate={w.point}
                            anchor={{ x: 0.5, y: 0.5 }}
                            tracksViewChanges={state === 'current'}
                            testID={`home-marker-${w.key}`}
                            accessibilityLabel={`${w.number} ${w.name ?? w.address ?? ''}`.trim()}
                        >
                            {/* Several orders share this map: each keeps the colour the console gives it. */}
                            <StopBadge kind={mark?.kind} number={mark?.number} color={colorForId(w.orderId ?? '')} state={state} />
                        </Marker>
                    );
                })}
            </MapView>
        </YStack>
    );
}

export default HomeMap;
