/**
 * The dashboard's map: the day's waypoints, the driver, and the way to the
 * next one.
 *
 * It is a picture, not a tool. Touches pass through to the page so the
 * dashboard scrolls when a thumb lands on the map; the working map with pan
 * and zoom lives on the route and order screens.
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
 */
import { useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { YStack, useTheme } from 'tamagui';
import { StopBadge, markerKindOf } from '../../ui/RouteMap';
import { CasedPolyline } from '../../ui/CasedPolyline';
import { colorForId } from '../../ui/routeColors';
import { routeRuns, useManifestRecord, useManifestRoute, type LatLng } from '../../data';
import type { HomeWaypoint } from './homeModel';

export interface HomeMapProps {
    waypoints: HomeWaypoint[];
    /** The waypoint being headed to. */
    activeKey?: string;
    /** The road route to it, decoded. Empty draws the straight-line fallback. */
    route?: LatLng[];
    position?: LatLng | null;
    dark?: boolean;
    height: number;
    /** Room to keep clear at the top (floating controls) and bottom (the sheet's overlap). */
    padding?: { top?: number; bottom?: number };
    testID?: string;
}

export function HomeMap({ waypoints, activeKey, route = [], position, dark, height, padding, testID = 'home-map' }: HomeMapProps) {
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

    // Fit when the set of waypoints or the route changes, not on every position tick.
    const fitKey = `${placed.map((w) => `${w.key}${w.done ? 'd' : ''}`).join('|')}:${activeKey}:${route.length}:${position ? 1 : 0}`;
    useEffect(() => {
        // With a next waypoint the view is the leg to it; without one, the whole day.
        const active = placed.find((w) => w.key === activeKey);
        const focus = active ? [active.point, ...route, ...(position ? [position] : [])] : [];
        const coordinates = focus.length > 1 ? focus : [...placed.map((w) => w.point), ...(position ? [position] : [])];
        if (!coordinates.length) return;
        ref.current?.fitToCoordinates(coordinates, {
            edgePadding: { top: 40 + (padding?.top ?? 0), right: 48, bottom: 40 + (padding?.bottom ?? 0), left: 48 },
            animated: false,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey]);

    if (!placed.length) return null;

    return (
        <YStack height={height} backgroundColor="$surface" pointerEvents="none" testID={testID}>
            <MapView
                ref={ref}
                style={{ flex: 1 }}
                initialRegion={{ ...placed[0].point, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
                userInterfaceStyle={dark ? 'dark' : 'light'}
                showsUserLocation
                showsMyLocationButton={false}
                showsCompass={false}
                toolbarEnabled={false}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
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
                {placed.map((w) => {
                    const state = w.skipped ? 'skipped' : w.done ? 'done' : w.key === activeKey ? 'current' : 'pending';
                    const mark = marks.get(w.key);
                    return (
                        <Marker
                            // The badge is drawn once (`tracksViewChanges` off), so a change of state needs a new marker.
                            key={`${w.key}:${state}`}
                            coordinate={w.point}
                            anchor={{ x: 0.5, y: 0.5 }}
                            tracksViewChanges={false}
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
