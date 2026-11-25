/**
 * Jobs → Map — design round 3 (WorkMap.dc.html).
 *
 * Every waypoint of the day on one map, with the line between them drawn in
 * three parts so its state is not carried by colour alone: solid behind the
 * driver, heavier to the waypoint being headed to, dashed for what comes
 * later. The marks are the same ones the Route list uses.
 *
 * The line joins waypoints directly. It is the plan's order, not the road:
 * the manifest carries no route geometry, and the app asks no directions
 * service of its own — the road comes from the navigation app the driver
 * hands off to.
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
import { useTranslation } from '../../i18n/useTranslation';
import { useResolvedScheme } from '../../settings';
import { useDeviceLocation } from '../../shell';
import { formatClock, formatMeters } from '../../format';
import type { LatLng } from '../../data';
import { CARD_RADIUS, GUTTER, IconButton, SectionLabel, WaypointMark } from './parts';
import { waypointTag } from './JobsRoute';
import type { JobWaypoint } from './model';

type Placed = JobWaypoint & { point: LatLng };

function LegendChip({ label, kind }: { label: string; kind: 'done' | 'now' | 'later' }) {
    return (
        <XStack height={30} paddingHorizontal={10} gap={6} alignItems="center" borderRadius={15} backgroundColor="$background" borderWidth={1} borderColor="$border">
            <YStack
                width={14}
                height={0}
                borderTopWidth={3}
                borderColor={kind === 'done' ? '$success' : kind === 'now' ? '$primary' : '$textMuted'}
                borderStyle={kind === 'later' ? 'dotted' : 'solid'}
            />
            <Body fontSize={12} fontWeight="700" tone="secondary">
                {label}
            </Body>
        </XStack>
    );
}

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

    const lines = useMemo(() => {
        const points = placed.map((w) => w.point);
        const at = current ? placed.indexOf(current) : -1;
        if (at < 0) {
            // Nothing is being headed to: all behind, or all ahead.
            const allDone = placed.length > 0 && placed.every((w) => w.state === 'done' || w.state === 'skipped');
            return { done: allDone ? points : [], now: [] as LatLng[], later: allDone ? [] : points };
        }
        // The driver's own position starts the "now" leg when there is a fix.
        const from = position ?? (at > 0 ? points[at - 1] : undefined);
        return { done: points.slice(0, at), now: from ? [from, points[at]] : [], later: points.slice(at) };
    }, [placed, current, position]);

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
                {lines.done.length > 1 ? <Polyline coordinates={lines.done} strokeColor={theme.success?.val as string} strokeWidth={5} /> : null}
                {lines.later.length > 1 ? <Polyline coordinates={lines.later} strokeColor={theme.textMuted?.val as string} strokeWidth={4} lineDashPattern={[2, 9]} /> : null}
                {lines.now.length > 1 ? <Polyline coordinates={lines.now} strokeColor={theme.primary?.val as string} strokeWidth={6} /> : null}
                {placed.map((waypoint) => {
                    const state = waypoint.state === 'done' || waypoint.state === 'skipped' ? 'done' : waypoint.state === 'current' ? 'current' : 'pending';
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
                            <StopBadge sequence={waypoint.sequence} state={state} />
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
                    <LegendChip kind="done" label={t('jobs.map.legendDone')} />
                    <LegendChip kind="now" label={t('jobs.map.legendNow')} />
                    <LegendChip kind="later" label={t('jobs.map.legendLater')} />
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
