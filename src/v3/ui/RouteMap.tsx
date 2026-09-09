/**
 * The route map — R1 frames s02 / s17.
 *
 * One map for the whole route surface. v2 embedded a live map in every order
 * card, so a list of N orders fired N Directions requests; here the map is the
 * Route tab's own and the cards carry none.
 *
 * Markers are the design's stop-sequence badge (min 44dp) rather than the
 * platform pin, so a stop reads the same on the map as in the list: number,
 * state, and a glyph for done — never colour alone. The line joining them is
 * the straight-line plan, which is honest about what the app knows: nothing
 * here asks a directions service, and a driver's actual road comes from the
 * navigation app they hand off to.
 */
import { useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { YStack, useTheme } from 'tamagui';
import { Body, Micro } from './Text';
import { hitTarget, radius } from '../theme/tokens';
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

function StopBadge({ sequence, state }: { sequence?: number; state: 'done' | 'current' | 'pending' }) {
    const background = state === 'current' ? '$primary' : state === 'done' ? '$successFill' : '$surface';
    const border = state === 'current' ? '$primary' : state === 'done' ? '$successBorder' : '$border';
    const size = hitTarget.min;
    return (
        <YStack
            width={size}
            height={size}
            borderRadius={radius.compact + 2}
            borderWidth={state === 'current' ? 0 : 1.5}
            borderColor={border as never}
            backgroundColor={background as never}
            alignItems="center"
            justifyContent="center"
        >
            {state === 'done' ? (
                <Micro tone="success" fontSize={16}>
                    ✓
                </Micro>
            ) : (
                <Body fontSize={17} fontWeight="800" tone={state === 'current' ? 'onPrimary' : 'primary'} tabular>
                    {sequence ?? '·'}
                </Body>
            )}
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
            userInterfaceStyle={dark ? 'dark' : 'light'}
            showsUserLocation
            showsMyLocationButton={false}
            showsCompass={false}
            toolbarEnabled={false}
        >
            {line.length > 1 ? (
                <Polyline coordinates={line} strokeColor={theme.primary?.val as string} strokeWidth={4} lineDashPattern={[8, 6]} />
            ) : null}
            {placed.map(({ stop, point }) => {
                const state = isStopDone(stop) ? 'done' : stop.id === currentStopId ? 'current' : 'pending';
                return (
                    <Marker
                        key={stop.id}
                        coordinate={point}
                        anchor={{ x: 0.5, y: 0.5 }}
                        tracksViewChanges={false}
                        onPress={onPressStop ? () => onPressStop(stop) : undefined}
                        testID={`route-marker-${stop.id}`}
                        accessibilityLabel={`${stop.sequence ?? ''} ${stop.place?.name ?? ''}`.trim()}
                    >
                        <StopBadge sequence={stop.sequence} state={state} />
                    </Marker>
                );
            })}
        </MapView>
    );
}

export default RouteMap;
