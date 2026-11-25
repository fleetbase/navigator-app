/**
 * Jobs → Map — design round 3 (WorkMap.dc.html).
 *
 * Every waypoint of the day on one map, joined by the road between them.
 *
 * The road is the server's, never the app's own guess: the manifest's route
 * (`useManifestRoute`) when dispatch built one, cut into the part behind the
 * driver, the leg being driven and the part still to come; without a manifest,
 * the tracker's route for the one order being driven. Wherever the app has no
 * road it joins waypoints with a straight **dashed** line, so a dashed line
 * always reads as "not the road" and a solid one always is the road.
 *
 * State is never carried by colour alone: the leg being driven is the heaviest
 * line, the part behind is thinner and see-through, and the markers carry
 * their own state (see `StopBadge`).
 *
 * Markers are the console's: P, D and R for the ends of an order, a number on
 * the order's own colour for the waypoints in between. The driving order is
 * told by the line and by the Route list, not by the number in the marker.
 *
 * Built on react-native-maps like `ui/RouteMap`, using only what the web
 * build's Leaflet stand-in implements (web/maps.jsx): MapView with
 * `fitToCoordinates` / `animateToRegion`, Marker and Polyline.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Secondary } from '../../ui/Text';
import { EmptyState } from '../../ui/Banner';
import { StopBadge } from '../../ui/RouteMap';
import { CasedPolyline } from '../../ui/CasedPolyline';
import { colorForId } from '../../ui/routeColors';
import { useTranslation } from '../../i18n/useTranslation';
import { useResolvedScheme } from '../../settings';
import { useDeviceLocation } from '../../shell';
import { formatClock, formatMeters } from '../../format';
import { decodePolyline, routeRuns, useManifestRoute, useTracker, type LatLng, type RouteRunKind } from '../../data';
import { CARD_RADIUS, GUTTER, IconButton, SectionLabel, WaypointMark } from './parts';
import { waypointTag } from './JobsRoute';
import type { JobWaypoint } from './model';

type Placed = JobWaypoint & { point: LatLng };

function LegendChip({ label, kind, dashed }: { label: string; kind: RouteRunKind | 'straight'; dashed?: boolean }) {
    return (
        <XStack height={30} paddingHorizontal={10} gap={6} alignItems="center" borderRadius={15} backgroundColor="$background" borderWidth={1} borderColor="$border">
            <YStack
                width={14}
                height={0}
                borderTopWidth={kind === 'now' ? 4 : 3}
                borderColor={kind === 'done' ? '$success' : kind === 'later' ? '$textMuted' : '$primary'}
                borderStyle={dashed ? 'dashed' : 'solid'}
                opacity={kind === 'done' && !dashed ? 0.7 : 1}
            />
            <Body fontSize={12} fontWeight="700" tone="secondary">
                {label}
            </Body>
        </XStack>
    );
}

interface Line {
    kind: RouteRunKind;
    coordinates: LatLng[];
}

const runKind = (state: JobWaypoint['state']): RouteRunKind => (state === 'done' || state === 'skipped' ? 'done' : state === 'current' ? 'now' : 'later');

/** Dash patterns for straight lines. All dashed (not the road); told apart by rhythm and weight as well as colour. */
const DASH: Record<RouteRunKind, { pattern: number[]; width: number }> = {
    done: { pattern: [10, 6], width: 3 },
    now: { pattern: [10, 6], width: 5 },
    later: { pattern: [2, 8], width: 4 },
};

export interface JobsMapProps {
    waypoints: JobWaypoint[];
    units: 'metric' | 'imperial';
    onOpenWaypoint?: (waypoint: JobWaypoint) => void;
    /** Room for the floating tab bar. */
    bottomSpace: number;
}

export function JobsMap({ waypoints, units, onOpenWaypoint, bottomSpace }: JobsMapProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const scheme = useResolvedScheme();
    const position = useDeviceLocation();
    const ref = useRef<MapView>(null);

    const placed = useMemo(() => waypoints.filter((w): w is Placed => Boolean(w.point)), [waypoints]);
    const current = placed.find((w) => w.state === 'current');
    const [pickedKey, setPickedKey] = useState<string | undefined>();
    // The card follows the waypoint being headed to until the driver taps another.
    const selected = placed.find((w) => w.key === pickedKey) ?? current ?? placed.find((w) => w.state === 'later') ?? placed[placed.length - 1];

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
    const drivenDone = drivenOrderId ? waypoints.filter((w) => w.orderId === drivenOrderId && runKind(w.state) === 'done').length : 0;
    const { tracker } = useTracker(drivenOrderId, drivenDone);
    const trackerRoute = useMemo(() => {
        if (!drivenOrderId) return [];
        // The hook keeps its last answer while the order changes: only draw a route that is about this order's places.
        const mine = (tracker?.stops ?? []).some((stop) => waypoints.some((w) => w.key === `${drivenOrderId}:${stop.public_id}`));
        return mine ? decodePolyline(tracker?.route?.polyline) : [];
    }, [tracker, drivenOrderId, waypoints]);

    const { road, straight } = useMemo(() => {
        const road: Line[] = [];
        const straight: Line[] = [];
        const at = current ? placed.indexOf(current) : -1;

        if (manifestRoute) {
            const stateOf = new Map(waypoints.flatMap((w) => (w.stopId ? [[w.stopId, runKind(w.state)] as const] : [])));
            const allDone = placed.every((w) => runKind(w.state) === 'done');
            road.push(...routeRuns(manifestRoute, (stopId) => (stopId ? stateOf.get(stopId) : undefined) ?? 'later', allDone ? 'done' : 'now'));
            // The route runs waypoint to waypoint, so nothing leads to the first one: join the driver to it.
            const leadsToCurrent = manifestRoute.hasLegGeometry ? manifestRoute.legs.some((leg) => leg.toStop === current?.stopId) : at > 0;
            if (current && position && !leadsToCurrent) straight.push({ kind: 'now', coordinates: [position, current.point] });
            return { road, straight };
        }

        const hasTrackerRoute = trackerRoute.length > 1;
        if (hasTrackerRoute) road.push({ kind: 'now', coordinates: trackerRoute });

        // Straight lines, waypoint to waypoint, each taking the state of the waypoint it leads to.
        const push = (kind: RouteRunKind, from: LatLng, to: LatLng) => {
            const last = straight[straight.length - 1];
            const end = last?.coordinates[last.coordinates.length - 1];
            if (last && last.kind === kind && end === from) last.coordinates.push(to);
            else straight.push({ kind, coordinates: [from, to] });
        };
        placed.forEach((waypoint, index) => {
            const kind = runKind(waypoint.state);
            // The tracker's route already runs from the driver through what is left of the driven order.
            if (hasTrackerRoute && waypoint.orderId === drivenOrderId && kind !== 'done') return;
            // The driver's own position starts the leg being driven when there is a fix.
            const from = kind === 'now' && position ? position : index > 0 ? placed[index - 1].point : undefined;
            if (from) push(kind, from, waypoint.point);
        });
        return { road, straight };
    }, [placed, waypoints, current, position, manifestRoute, trackerRoute, drivenOrderId]);

    const tone: Record<RouteRunKind, string> = { done: theme.success?.val as string, now: theme.primary?.val as string, later: theme.textMuted?.val as string };

    const fit = (animated: boolean) => {
        const coordinates = [...placed.map((w) => w.point), ...(position ? [position] : [])];
        if (!coordinates.length) return;
        ref.current?.fitToCoordinates(coordinates, { edgePadding: { top: 72, right: 64, bottom: 220, left: 48 }, animated });
    };

    // Fit when the set of waypoints changes, not on every position tick.
    const fitKey = placed.map((w) => w.key).join('|');
    useEffect(() => {
        fit(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey]);

    if (!placed.length) {
        return (
            <YStack flex={1} paddingHorizontal={GUTTER} testID="route-map-view">
                <EmptyState title={t(waypoints.length ? 'jobs.map.noPositions' : 'jobs.route.emptyTitle')} body={waypoints.length ? undefined : t('jobs.route.emptyBody')} testID="route-map-empty" />
            </YStack>
        );
    }

    const first = current?.point ?? placed[0].point;
    const selectedTag = selected ? waypointTag(selected, t) : '';

    return (
        <YStack flex={1} testID="route-map-view">
            <MapView
                ref={ref}
                testID="route-map"
                style={{ flex: 1 }}
                initialRegion={{ ...first, latitudeDelta: 0.2, longitudeDelta: 0.2 }}
                userInterfaceStyle={scheme !== 'light' && scheme !== 'sunlight' ? 'dark' : 'light'}
                showsUserLocation
                showsMyLocationButton={false}
                showsCompass={false}
                toolbarEnabled={false}
            >
                {/* Behind first, the leg being driven last, so it is never covered. */}
                {(['done', 'later', 'now'] as const).flatMap((kind, layer) =>
                    road
                        .filter((line) => line.kind === kind)
                        .map((line, index) => (
                            <CasedPolyline
                                key={`road-${kind}-${index}`}
                                coordinates={line.coordinates}
                                color={tone[kind]}
                                variant={kind === 'done' ? 'completed' : kind === 'now' ? 'live' : 'upcoming'}
                                zIndex={layer + 1}
                            />
                        ))
                )}
                {straight.map((line, index) => (
                    <Polyline
                        key={`straight-${line.kind}-${index}`}
                        coordinates={line.coordinates}
                        strokeColor={tone[line.kind]}
                        strokeWidth={DASH[line.kind].width}
                        lineDashPattern={DASH[line.kind].pattern}
                    />
                ))}
                {placed.map((waypoint) => {
                    const state = waypoint.state === 'skipped' ? 'skipped' : waypoint.state === 'done' ? 'done' : waypoint.state === 'current' ? 'current' : 'pending';
                    return (
                        <Marker
                            // Custom markers are drawn once (`tracksViewChanges`), so a change of state needs a new marker.
                            key={`${waypoint.key}:${state}`}
                            coordinate={waypoint.point}
                            anchor={{ x: 0.5, y: 0.5 }}
                            tracksViewChanges={false}
                            onPress={() => setPickedKey(waypoint.key)}
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

            <YStack position="absolute" top={8} end={GUTTER} gap={8}>
                {position ? (
                    <IconButton
                        name="locate"
                        label={t('jobs.map.centreOnMe')}
                        round
                        overMap
                        onPress={() => ref.current?.animateToRegion({ ...position, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 350)}
                        testID="jobs-map-locate"
                    />
                ) : null}
                <IconButton name="fit" label={t('jobs.map.showAll')} round overMap onPress={() => fit(true)} testID="route-recenter" />
            </YStack>

            <YStack position="absolute" start={GUTTER} end={GUTTER} bottom={bottomSpace} gap={8} pointerEvents="box-none">
                <XStack gap={8} pointerEvents="none">
                    <LegendChip kind="done" dashed={!road.length} label={t('jobs.map.legendDone')} />
                    <LegendChip kind="now" dashed={!road.length} label={t('jobs.map.legendNow')} />
                    <LegendChip kind="later" dashed={!road.length} label={t('jobs.map.legendLater')} />
                    {/* Only worth saying when both kinds of line are on the map together. */}
                    {road.length && straight.length ? <LegendChip kind="straight" dashed label={t('jobs.map.legendStraight')} /> : null}
                </XStack>
                {selected ? (
                    <XStack
                        padding={14}
                        gap={12}
                        alignItems="center"
                        borderRadius={CARD_RADIUS}
                        backgroundColor="$surface"
                        borderWidth={1.5}
                        borderColor={selected.state === 'current' ? '$primary' : '$border'}
                        shadowColor="$shadowColor"
                        shadowOpacity={0.4}
                        shadowRadius={14}
                        shadowOffset={{ width: 0, height: 8 }}
                        elevation={8}
                        onPress={onOpenWaypoint ? () => onOpenWaypoint(selected) : undefined}
                        pressStyle={onOpenWaypoint ? { opacity: 0.8 } : undefined}
                        accessibilityRole="button"
                        accessibilityLabel={`${selected.sequence}. ${selectedTag}. ${selected.name ?? selected.address ?? ''}`}
                        testID="route-next-stop"
                    >
                        <WaypointMark state={selected.state} label={selected.sequence} size={44} />
                        <YStack flex={1} gap={2}>
                            <SectionLabel tone={selected.state === 'current' ? 'brand' : selected.state === 'done' ? 'success' : 'muted'}>{selectedTag}</SectionLabel>
                            <Body fontSize={17} fontWeight="800" numberOfLines={1}>
                                {selected.name ?? selected.address ?? t('jobs.unnamed', { sequence: selected.sequence })}
                            </Body>
                            {selected.trackingNumber ? (
                                <Body fontFamily="$mono" fontSize={13} fontWeight="500" tone="secondary">
                                    {selected.trackingNumber}
                                </Body>
                            ) : null}
                        </YStack>
                        {selected.eta || selected.arrivedAt || selected.distanceFromPrevM != null ? (
                            <YStack alignItems="flex-end" gap={2}>
                                {selected.state === 'done' ? (
                                    selected.arrivedAt ? (
                                        <Body fontSize={22} fontWeight="800" tabular>
                                            {formatClock(selected.arrivedAt)}
                                        </Body>
                                    ) : null
                                ) : selected.eta ? (
                                    <Body fontSize={22} fontWeight="800" tabular>
                                        {formatClock(selected.eta)}
                                    </Body>
                                ) : null}
                                {selected.state !== 'done' && selected.distanceFromPrevM != null ? (
                                    <Secondary fontSize={13} tabular>
                                        {formatMeters(selected.distanceFromPrevM, units)}
                                    </Secondary>
                                ) : null}
                            </YStack>
                        ) : null}
                    </XStack>
                ) : null}
            </YStack>
        </YStack>
    );
}

export default JobsMap;
