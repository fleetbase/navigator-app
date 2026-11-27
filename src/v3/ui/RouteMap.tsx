/**
 * The route map — R1 frames s02 / s17.
 *
 * One map for the whole route surface. v2 embedded a live map in every order
 * card, so a list of N orders fired N Directions requests; here the map is the
 * Route tab's own and the cards carry none.
 *
 * Markers are the FleetOps console's waypoint markers (see `StopBadge`), so a
 * waypoint looks the same to the driver as to the dispatcher they are talking
 * to. The line joining them here is the straight-line plan, dashed so it reads
 * as "not the road"; the Jobs map and the dashboard draw the road itself.
 */
import { mapLook } from './mapLook';
import { useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { YStack, useTheme } from 'tamagui';
import { Body } from './Text';
import { hitTarget } from '../theme/tokens';
import { WAYPOINT_DONE_COLOR, colorForId, describeWaypoint, type WaypointMarkerKind } from './routeColors';
import type { ManifestStopRecord } from '../data/manifestStore';
import { coordsOfStop, isStopDone, type LatLng } from '../data/routeGeo';

export interface RouteMapProps {
    stops: ManifestStopRecord[];
    currentStopId?: string;
    /** The driver, when there is a fix. */
    position?: LatLng | null;
    /** Apple Maps honours this directly; Google needs a style, which is a follow-up. */
    dark?: boolean;
    onPressStop?: (stop: ManifestStopRecord) => void;
    /** Bumped to re-fit the map to the route — the "re-centre" affordance. */
    fitToken?: number;
    testID?: string;
}

interface PlacedStop {
    stop: ManifestStopRecord;
    point: LatLng;
}

/** Only stops with a coordinate can be placed; the rest are the list's problem. */
export function placeableStops(stops: ManifestStopRecord[]): PlacedStop[] {
    return stops
        .map((stop) => {
            const point = coordsOfStop(stop);
            return point ? { stop, point } : null;
        })
        .filter(Boolean) as PlacedStop[];
}

export type StopBadgeState = 'done' | 'current' | 'pending' | 'skipped';

export interface StopBadgeProps {
    /** What the waypoint is to its order. Unknown is drawn as a numbered waypoint. */
    kind?: WaypointMarkerKind;
    /** The number inside an in-between waypoint. */
    number?: number;
    /** The route's colour, for an in-between waypoint. On a map of several orders, the order's. */
    color?: string;
    state: StopBadgeState;
}

/** The roles a manifest stop or tracker stop can name, as a marker draws them. */
export function markerKindOf(type: unknown): WaypointMarkerKind | undefined {
    return type === 'pickup' || type === 'dropoff' || type === 'return' || type === 'waypoint' ? type : undefined;
}

/**
 * A waypoint's marker on a map.
 *
 * The base is the console's marker exactly (`waypointIconHtml`): a 32px circle,
 * a 2.5px white border, a soft shadow, and P / D / R or the waypoint's number
 * in white. On top of that the app shows state, because a driver needs it at a
 * glance, and never by colour alone:
 *
 *   - done: the same letter or number, dimmed, with a small check badge;
 *   - being driven to: larger (40px) with a ring around it;
 *   - skipped: hollow, with a dash instead of the letter or number.
 *
 * The frame around the circle is fixed per size and larger than the circle:
 * Android clips a marker to its view, so the ring and the check badge need
 * room inside it, and it gives a thumb the full tap target.
 */
export function StopBadge({ kind, number, color, state }: StopBadgeProps) {
    const { label, color: fill } = describeWaypoint(kind, number, color);
    const current = state === 'current';
    const skipped = state === 'skipped';
    const done = state === 'done';
    const size = current ? 40 : 32;
    const frame = current ? 52 : hitTarget.min;

    return (
        <YStack width={frame} height={frame} alignItems="center" justifyContent="center">
            {current ? <YStack position="absolute" width={frame} height={frame} borderRadius={frame / 2} borderWidth={3} borderColor={fill as never} /> : null}
            <YStack
                width={size}
                height={size}
                borderRadius={size / 2}
                borderWidth={2.5}
                borderColor={(skipped ? fill : '#FFFFFF') as never}
                backgroundColor={(skipped ? '#FFFFFF' : fill) as never}
                opacity={done ? 0.55 : 1}
                alignItems="center"
                justifyContent="center"
                shadowColor="#000000"
                shadowOpacity={skipped ? 0.2 : 0.45}
                shadowRadius={4}
                shadowOffset={{ width: 0, height: 2 }}
                elevation={skipped ? 1 : 4}
            >
                <Body fontSize={current ? 16 : 13} lineHeight={current ? 20 : 16} fontWeight="700" color={(skipped ? fill : '#FFFFFF') as never} tabular>
                    {skipped ? '–' : label}
                </Body>
            </YStack>
            {done ? (
                <YStack
                    position="absolute"
                    top={(frame - size) / 2 - 4}
                    right={(frame - size) / 2 - 4}
                    width={16}
                    height={16}
                    borderRadius={8}
                    borderWidth={1.5}
                    borderColor="#FFFFFF"
                    backgroundColor={WAYPOINT_DONE_COLOR as never}
                    alignItems="center"
                    justifyContent="center"
                >
                    <Body fontSize={9} lineHeight={12} fontWeight="800" color="#FFFFFF">
                        ✓
                    </Body>
                </YStack>
            ) : null}
        </YStack>
    );
}

export function RouteMap({ stops, currentStopId, position, dark, onPressStop, fitToken = 0, testID }: RouteMapProps) {
    const theme = useTheme();
    const ref = useRef<MapView>(null);
    const placed = useMemo(() => placeableStops(stops), [stops]);

    const line = useMemo(() => {
        const points = placed.filter(({ stop }) => !isStopDone(stop)).map(({ point }) => point);
        return position ? [position, ...points] : points;
    }, [placed, position]);

    useEffect(() => {
        const coordinates = [...placed.map((p) => p.point), ...(position ? [position] : [])];
        if (!coordinates.length) return;
        ref.current?.fitToCoordinates(coordinates, {
            edgePadding: { top: 80, right: 48, bottom: 200, left: 48 },
            animated: fitToken > 0,
        });
        // Re-fit when the set of stops or the request changes, not on every position tick.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placed, fitToken]);

    const first = placed[0]?.point ?? position ?? { latitude: 0, longitude: 0 };

    return (
        <MapView
            ref={ref}
            testID={testID ?? 'route-map'}
            style={{ flex: 1 }}
            initialRegion={{ ...first, latitudeDelta: 0.2, longitudeDelta: 0.2 }}
            {...mapLook(dark)}
            showsUserLocation
            showsMyLocationButton={false}
            showsCompass={false}
            toolbarEnabled={false}
        >
            {line.length > 1 ? (
                <Polyline coordinates={line} strokeColor={theme.primary?.val as string} strokeWidth={4} lineDashPattern={[8, 6]} />
            ) : null}
            {placed.map(({ stop, point }) => {
                const state = stop.status === 'skipped' ? 'skipped' : isStopDone(stop) ? 'done' : stop.id === currentStopId ? 'current' : 'pending';
                return (
                    <Marker
                        // The badge is drawn once (`tracksViewChanges` off), so a change of state needs a new marker.
                        key={`${stop.id}:${state}`}
                        coordinate={point}
                        anchor={{ x: 0.5, y: 0.5 }}
                        tracksViewChanges={false}
                        onPress={onPressStop ? () => onPressStop(stop) : undefined}
                        testID={`route-marker-${stop.id}`}
                        accessibilityLabel={`${stop.sequence ?? ''} ${stop.place?.name ?? ''}`.trim()}
                    >
                        {/* The number is the waypoint's own within its order when the server says; the line shows the driving order. */}
                        <StopBadge kind={markerKindOf(stop.type)} number={stop.waypoint_index ?? stop.sequence} color={colorForId(stop.order?.id ?? '')} state={state} />
                    </Marker>
                );
            })}
        </MapView>
    );
}

export default RouteMap;
