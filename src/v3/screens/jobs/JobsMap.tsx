/**
 * Jobs → Map — the simple Jobs design (JobsSimpleMap.dc.html).
 *
 * Today's orders as one route on one map: the driver, every waypoint, and the
 * road between them, with a single card at the foot that names the route and
 * offers to optimise it.
 *
 * Lines follow the app's rules (MapMarkers.dc.html):
 *
 *   - the road is the server's, never the app's own guess: the manifest's
 *     route when dispatch built one, otherwise the tracker's route for the one
 *     order being driven;
 *   - each order keeps the colour the console gives it, so one order is one
 *     colour everywhere: its markers, its row in the Route list, and its part
 *     of the line here. The part already driven is the same colour, thinner
 *     and fainter;
 *   - where the app has no road it joins waypoints with a straight **dashed**
 *     grey line, so a dashed line always reads as "not the road".
 *
 * Markers are the console's (`StopBadge`): P, D and R for the ends of an order,
 * a number on the order's own colour for the waypoints in between. Tapping one
 * opens that waypoint. The driver is the app's own mark (`DriverPuck`).
 *
 * Built on react-native-maps using only what the web build's Leaflet stand-in
 * implements (web/maps.jsx): MapView with `fitToCoordinates` /
 * `animateToRegion`, Marker and Polyline.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body } from '../../ui/Text';
import { EmptyState } from '../../ui/Banner';
import { StopBadge } from '../../ui/RouteMap';
import { CasedPolyline } from '../../ui/CasedPolyline';
import { DriverPuck } from '../../ui/DriverPuck';
import { mapLook } from '../../ui/mapLook';
import { colorForId, type RouteLineVariant } from '../../ui/routeColors';
import { useTranslation } from '../../i18n/useTranslation';
import { useResolvedScheme } from '../../settings';
import { useDeviceLocation } from '../../shell';
import { formatMeters } from '../../format';
import { decodePolyline, useManifestRoute, useTracker, type LatLng, type ManifestRecord } from '../../data';
import { CARD_RADIUS, Glyph, GUTTER } from './parts';
import type { JobWaypoint, RouteCounts } from './model';

type Placed = JobWaypoint & { point: LatLng };

interface RoadLine {
    color: string;
    variant: RouteLineVariant;
    coordinates: LatLng[];
}

const isBehind = (state: JobWaypoint['state']) => state === 'done' || state === 'skipped';

/** With only one place to show, a few streets around it. */
const STREET = { latitudeDelta: 0.01, longitudeDelta: 0.01 };

export interface JobsMapProps {
    manifest?: ManifestRecord;
    waypoints: JobWaypoint[];
    counts: RouteCounts;
    units: 'metric' | 'imperial';
    isOnline: boolean;
    /** The driver is offline (not working): their mark on the map is grey and still. */
    offDuty?: boolean;
    onOpenWaypoint?: (waypoint: JobWaypoint) => void;
    /** Opens the before / after preview that re-orders what is left of the route. */
    onOptimise?: () => void;
    /** Room for the floating tab bar. */
    bottomSpace: number;
}

export function JobsMap({ manifest, waypoints, counts, units, isOnline, offDuty, onOpenWaypoint, onOptimise, bottomSpace }: JobsMapProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const scheme = useResolvedScheme();
    const dark = scheme !== 'light' && scheme !== 'sunlight';
    const position = useDeviceLocation();
    const ref = useRef<MapView>(null);

    const placed = useMemo(() => waypoints.filter((w): w is Placed => Boolean(w.point)), [waypoints]);
    const current = placed.find((w) => w.state === 'current');

    // The manifest's road, asked for once per sequence and shared with the dashboard's map.
    const manifestId = useMemo(() => waypoints.find((w) => w.manifestId)?.manifestId, [waypoints]);
    const routeStops = useMemo(
        () => waypoints.flatMap((w) => (w.stopId ? [{ id: w.stopId, status: w.state === 'skipped' ? 'skipped' : w.state === 'done' ? 'completed' : 'pending' }] : [])),
        [waypoints]
    );
    const { route: manifestRoute } = useManifestRoute(manifestId, routeStops);

    /*
     * No manifest: the only road worth asking for is the one being driven. One
     * tracker request for that order, asked again when one of its waypoints is
     * finished; every other order is joined by straight dashed lines. A request
     * per order would be a routing call per order each time the map opens.
     */
    const drivenOrderId = !manifestId ? current?.orderId : undefined;
    const drivenDone = drivenOrderId ? waypoints.filter((w) => w.orderId === drivenOrderId && isBehind(w.state)).length : 0;
    const { tracker } = useTracker(drivenOrderId, drivenDone);
    const trackerRoute = useMemo(() => {
        if (!drivenOrderId) return [];
        // The hook keeps its last answer while the order changes: only draw a route that is about this order's places.
        const mine = (tracker?.stops ?? []).some((stop) => waypoints.some((w) => w.key === `${drivenOrderId}:${stop.public_id}`));
        return mine ? decodePolyline(tracker?.route?.polyline) : [];
    }, [tracker, drivenOrderId, waypoints]);

    const brand = theme.primary?.val as string;
    const { road, straight } = useMemo(() => {
        const road: RoadLine[] = [];
        const straight: LatLng[][] = [];
        const add = (color: string, variant: RouteLineVariant, coordinates: LatLng[]) => {
            const last = road[road.length - 1];
            // Neighbouring legs of the same order in the same state are one line, so a long day is a handful of lines.
            if (last && last.color === color && last.variant === variant) last.coordinates = [...last.coordinates, ...coordinates];
            else road.push({ color, variant, coordinates });
        };
        const at = current ? placed.indexOf(current) : -1;

        if (manifestRoute) {
            if (manifestRoute.hasLegGeometry) {
                const byStop = new Map(waypoints.flatMap((w) => (w.stopId ? [[w.stopId, w] as const] : [])));
                for (const leg of manifestRoute.legs) {
                    // A leg belongs to the waypoint it leads to: that order's colour, and driven once that waypoint is behind.
                    const to = leg.toStop ? byStop.get(leg.toStop) : undefined;
                    add(to?.orderId ? colorForId(to.orderId) : brand, to && isBehind(to.state) ? 'completed' : 'live', leg.coordinates);
                }
            } else {
                // One line for the whole day: there is nothing to cut it by, so it takes the brand colour.
                add(brand, placed.every((w) => isBehind(w.state)) ? 'completed' : 'live', manifestRoute.coordinates);
            }
            // The route runs waypoint to waypoint, so nothing leads to the first one: join the driver to it.
            const leadsToCurrent = manifestRoute.hasLegGeometry ? manifestRoute.legs.some((leg) => leg.toStop === current?.stopId) : at > 0;
            if (current && position && !leadsToCurrent) straight.push([position, current.point]);
            return { road, straight };
        }

        const hasTrackerRoute = trackerRoute.length > 1;
        if (hasTrackerRoute && drivenOrderId) add(colorForId(drivenOrderId), 'live', trackerRoute);

        // No road for the rest: straight lines, waypoint to waypoint, among what is still to do.
        placed.forEach((waypoint, index) => {
            if (isBehind(waypoint.state)) return;
            // The tracker's route already runs from the driver through what is left of the driven order.
            if (hasTrackerRoute && waypoint.orderId === drivenOrderId) return;
            const from = waypoint.state === 'current' && position ? position : index > 0 ? placed[index - 1].point : undefined;
            if (from) straight.push([from, waypoint.point]);
        });
        return { road, straight };
    }, [placed, waypoints, current, position, manifestRoute, trackerRoute, drivenOrderId, brand]);

    /*
     * A fit asked for before the map has loaded is dropped without a word, so
     * fitting waits for the map to say it is ready (see home/HomeMap).
     */
    const [ready, setReady] = useState(false);
    const fitted = useRef(false);
    // Fit when the set of waypoints changes or the first fix arrives, not on every position tick.
    const fitKey = `${placed.map((w) => w.key).join('|')}:${position ? 1 : 0}`;
    useEffect(() => {
        if (!ready) return;
        const coordinates = [...placed.map((w) => w.point), ...(position ? [{ latitude: position.latitude, longitude: position.longitude }] : [])];
        if (!coordinates.length) return;
        if (coordinates.length === 1) {
            ref.current?.animateToRegion({ ...coordinates[0], ...STREET }, fitted.current ? 300 : 0);
        } else {
            // The room for the card at the foot is the map's own padding (below), so this is only breathing space.
            ref.current?.fitToCoordinates(coordinates, { edgePadding: { top: 56, right: 48, bottom: 48, left: 48 }, animated: fitted.current });
        }
        fitted.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey, ready]);

    // The card's height, so the map knows which part of itself can be seen.
    const [cardHeight, setCardHeight] = useState(0);

    if (!placed.length) {
        return (
            <YStack flex={1} paddingHorizontal={GUTTER} paddingTop={16} testID="route-map-view">
                <EmptyState title={t(waypoints.length ? 'jobs.map.noPositions' : 'jobs.route.emptyTitle')} body={waypoints.length ? undefined : t('jobs.route.emptyBody')} testID="route-map-empty" />
            </YStack>
        );
    }

    const first = current?.point ?? placed[0].point;
    // The plan's own length, else the routing engine's for the line drawn. Never a figure worked out on the phone.
    const totalM = typeof manifest?.total_distance_m === 'number' && manifest.total_distance_m > 0 ? manifest.total_distance_m : manifestRoute?.distanceM;
    const figures = [t('jobs.orders.waypoints', { count: counts.total }), totalM ? formatMeters(totalM, units) : null].filter(Boolean).join(' · ');
    // Re-ordering needs a planned route, and something left on it to re-order.
    const canOptimise = Boolean(manifest) && Boolean(onOptimise) && counts.left >= 3;
    const background = theme.background?.val as string;

    return (
        <YStack flex={1} backgroundColor="$mapBackground" testID="route-map-view">
            <MapView
                ref={ref}
                testID="route-map"
                style={{ flex: 1 }}
                onMapReady={() => setReady(true)}
                mapPadding={{ top: 0, right: 0, bottom: cardHeight ? cardHeight + bottomSpace : bottomSpace, left: 0 }}
                initialRegion={{ ...first, latitudeDelta: 0.2, longitudeDelta: 0.2 }}
                {...mapLook(dark)}
                showsMyLocationButton={false}
                showsCompass={false}
                toolbarEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
            >
                {/* What is behind first, what is still to drive over it, so the road ahead is never covered. */}
                {(['completed', 'live'] as const).flatMap((variant, layer) =>
                    road
                        .filter((line) => line.variant === variant)
                        .map((line, index) => <CasedPolyline key={`road-${variant}-${index}`} coordinates={line.coordinates} color={line.color} variant={variant} zIndex={layer + 1} />)
                )}
                {straight.map((line, index) => (
                    <Polyline key={`straight-${index}`} coordinates={line} strokeColor={theme.textMuted?.val as string} strokeWidth={3} lineDashPattern={[8, 8]} />
                ))}
                {position ? (
                    // The driver, drawn by the app: pulsing, and pointing the way they are heading.
                    <Marker coordinate={{ latitude: position.latitude, longitude: position.longitude }} anchor={{ x: 0.5, y: 0.5 }} flat zIndex={5} tracksViewChanges testID="jobs-map-driver">
                        <DriverPuck color={brand} heading={position.heading} muted={offDuty} />
                    </Marker>
                ) : null}
                {placed.map((waypoint) => {
                    const state = waypoint.state === 'skipped' ? 'skipped' : waypoint.state === 'done' ? 'done' : waypoint.state === 'current' ? 'current' : 'pending';
                    return (
                        <Marker
                            // Custom markers are drawn once (`tracksViewChanges`), so a change of state needs a new marker.
                            key={`${waypoint.key}:${state}`}
                            coordinate={waypoint.point}
                            anchor={{ x: 0.5, y: 0.5 }}
                            tracksViewChanges={state === 'current'}
                            onPress={onOpenWaypoint ? () => onOpenWaypoint(waypoint) : undefined}
                            testID={`route-marker-${waypoint.stopId ?? waypoint.key}`}
                            accessibilityLabel={`${waypoint.sequence} ${waypoint.name ?? ''}`.trim()}
                        >
                            <StopBadge
                                kind={waypoint.isReturn ? 'return' : waypoint.role}
                                // Its number within its order; the place in the day only when nothing says what it is to its order.
                                number={waypoint.waypointNumber ?? waypoint.sequence}
                                // Several orders share this map: each keeps the colour the console gives it.
                                color={colorForId(waypoint.orderId ?? '')}
                                state={state}
                            />
                        </Marker>
                    );
                })}
            </MapView>

            {/* The header and the tabs sit over the map's top edge; the map fades in under them. */}
            <YStack position="absolute" top={0} start={0} end={0} height={28} pointerEvents="none">
                <Svg width="100%" height={28} preserveAspectRatio="none" viewBox="0 0 10 28">
                    <Defs>
                        <LinearGradient id="jobsMapFade" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={background} stopOpacity={1} />
                            <Stop offset="1" stopColor={background} stopOpacity={0} />
                        </LinearGradient>
                    </Defs>
                    <Rect x={0} y={0} width={10} height={28} fill="url(#jobsMapFade)" />
                </Svg>
            </YStack>

            <YStack
                position="absolute"
                start={GUTTER}
                end={GUTTER}
                bottom={bottomSpace}
                padding={14}
                gap={12}
                borderRadius={CARD_RADIUS}
                backgroundColor="$surface"
                borderWidth={1}
                borderColor="$border"
                shadowColor="$shadowColor"
                shadowOpacity={0.5}
                shadowRadius={14}
                shadowOffset={{ width: 0, height: 12 }}
                elevation={8}
                onLayout={(event) => setCardHeight(Math.round(event.nativeEvent.layout.height))}
                testID="jobs-map-card"
            >
                <XStack alignItems="baseline" justifyContent="space-between" gap={12}>
                    <Body flexShrink={1} fontSize={18} lineHeight={24} fontWeight="800" letterSpacing={-0.2} numberOfLines={1}>
                        {t('jobs.map.title')}
                    </Body>
                    <Body flexShrink={0} fontSize={15} lineHeight={24} fontWeight="700" tabular tone="secondary" numberOfLines={1} testID="jobs-map-figures">
                        {figures}
                    </Body>
                </XStack>
                {straight.length ? (
                    // A dashed line is not the road: the map says so wherever it has drawn one.
                    <Body fontSize={14} lineHeight={19} tone="secondary" testID="jobs-map-straight-note">
                        {t('jobs.map.straightNote')}
                    </Body>
                ) : null}
                {canOptimise ? (
                    <XStack
                        height={56}
                        borderRadius={16}
                        alignItems="center"
                        justifyContent="center"
                        gap={10}
                        backgroundColor="$primary"
                        opacity={isOnline ? 1 : 0.4}
                        onPress={isOnline ? onOptimise : undefined}
                        pressStyle={{ opacity: 0.8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('jobs.map.optimiseHint')}
                        accessibilityState={{ disabled: !isOnline }}
                        testID="route-optimise"
                    >
                        <Glyph name="reorder" size={20} color={theme.onPrimary?.val as string} strokeWidth={2.6} />
                        <Body fontSize={18} lineHeight={24} fontWeight="800" tone="onPrimary" numberOfLines={1}>
                            {t('jobs.map.optimise')}
                        </Body>
                    </XStack>
                ) : null}
            </YStack>
        </YStack>
    );
}

export default JobsMap;
