/**
 * The dashboard's map: the day's waypoints, the driver, and the way to the
 * next one.
 *
 * It is a picture, not a tool. Touches pass through to the page so the
 * dashboard scrolls when a thumb lands on the map; the working map with pan
 * and zoom lives on the route and order screens. Markers and the line follow
 * the same rules as `OrderMap`: the server's road route when the tracker sent
 * one, otherwise a dashed straight line that does not pretend to be the road.
 */
import { useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { YStack, useTheme } from 'tamagui';
import { StopBadge } from '../../ui/RouteMap';
import type { LatLng } from '../../data';
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
                    <Polyline coordinates={route} strokeColor={theme.primary?.val as string} strokeWidth={5} />
                ) : straight.length > 1 ? (
                    <Polyline coordinates={straight} strokeColor={theme.primary?.val as string} strokeWidth={4} lineDashPattern={[8, 6]} />
                ) : null}
                {placed.map((w) => (
                    <Marker
                        // The badge is drawn once (`tracksViewChanges` off), so a change of state needs a new marker.
                        key={`${w.key}:${w.done ? 'done' : w.key === activeKey ? 'current' : 'pending'}`}
                        coordinate={w.point}
                        anchor={{ x: 0.5, y: 0.5 }}
                        tracksViewChanges={false}
                        testID={`home-marker-${w.key}`}
                        accessibilityLabel={`${w.number} ${w.name ?? w.address ?? ''}`.trim()}
                    >
                        <StopBadge sequence={w.number} state={w.done ? 'done' : w.key === activeKey ? 'current' : 'pending'} />
                    </Marker>
                ))}
            </MapView>
        </YStack>
    );
}

export default HomeMap;
