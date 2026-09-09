/**
 * Route — R1 frames s02 (map), s03 (list), s17 (map, dark); R2 frame B1
 * (manifest list, multi-day).
 *
 * One screen, three segments. Today is the working surface: when the driver
 * has one manifest for the day it opens straight into the route — list or map
 * — because that is the tab's whole reason to exist. Upcoming and past are
 * cards, and opening one shows the same route view read-only.
 *
 * What the API does not carry, and how the screen degrades:
 *
 *   - A manifest has no name. The vehicle and the date stand in for one, and
 *     dispatch's `notes` ride along as the subtitle when there are any.
 *   - A stop has no time window; the resource carries `estimated_arrival`
 *     only. The window chip the frame draws is therefore absent, not faked.
 *   - "Finish ~17:05" is the last remaining stop's estimated arrival, when
 *     the server gave one. No estimate, no promise.
 *   - The planned break (s03) needs the HOS surface, which is still blocked
 *     on the console-only endpoints. It is not drawn.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Heading, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { Segmented } from '../ui/Field';
import { RouteProgress } from '../ui/Progress';
import { StopRow } from '../ui/Rows';
import { ManifestCard } from '../ui/Cards';
import { RouteMap, placeableStops } from '../ui/RouteMap';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSettings, useResolvedScheme } from '../settings';
import { useSync, useDeviceLocation } from '../shell';
import {
    useManifests,
    useManifest,
    groupManifests,
    scheduledDayOf,
    currentManifestStop,
    manifestProgress,
    coordsOfStop,
    isStopDone,
    type ManifestBucket,
    type ManifestRecord,
} from '../data';
import { dayKey } from '../data/orderStore';
import { formatClock, formatDay, formatMeters } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';

export interface RouteScreenProps {
    driverId?: string;
    reloadToken?: number;
    onOpenStop?: (manifestId: string, stopId: string) => void;
    onOptimise?: (manifestId: string) => void;
    onNavigate?: (destination: { latitude: number; longitude: number; label?: string }) => void;
}

type View = 'list' | 'map';

/** Straight from the frame: "TODAY, 19 AUG" / "TOMORROW, 20 AUG" / "THU, 21 AUG". */
function dateLabelFor(manifest: ManifestRecord, t: (k: string, o?: Record<string, unknown>) => string): string {
    const day = scheduledDayOf(manifest);
    const today = dayKey();
    const tomorrow = dayKey(new Date(Date.now() + 86_400_000));
    if (!day || day === today) return t('route.todayLabel', { date: formatDay(day ?? today) });
    if (day === tomorrow) return t('route.tomorrowLabel', { date: formatDay(day) });
    return formatDay(day, { weekday: true });
}

function subtitleFor(manifest: ManifestRecord, t: (k: string) => string): string {
    return [manifest.notes, manifest.vehicle_name ?? t('route.noVehicle')].filter(Boolean).join(' · ');
}

function ManifestList({
    manifests,
    bucket,
    units,
    onOpen,
    t,
}: {
    manifests: ManifestRecord[];
    bucket: ManifestBucket;
    units: 'metric' | 'imperial';
    onOpen: (id: string) => void;
    t: (k: string, o?: Record<string, unknown>) => string;
}) {
    const labels = useMemo(
        () => ({ stops: t('route.stopsMetric'), distance: t('route.distanceMetric'), duration: t('route.durationMetric') }),
        [t]
    );
    if (!manifests.length) {
        const key = bucket === 'today' ? 'Today' : bucket === 'upcoming' ? 'Upcoming' : 'Past';
        return <EmptyState title={t(`route.empty${key}Title`)} body={t(`route.empty${key}Body`)} testID={`route-empty-${bucket}`} />;
    }
    return (
        <YStack gap={space[3]}>
            {manifests.map((m) => {
                const progress = manifestProgress(m);
                const time =
                    m.started_at
                        ? { label: t('route.startedMetric'), value: formatClock(m.started_at) }
                        : undefined;
                return (
                    <ManifestCard
                        key={m.id}
                        testID={`manifest-${m.id}`}
                        manifestId={m.id}
                        status={m.status}
                        dateLabel={dateLabelFor(m, t)}
                        subtitle={subtitleFor(m, t)}
                        completedStops={progress.completed}
                        totalStops={progress.total || undefined}
                        distanceM={m.total_distance_m}
                        durationS={m.total_duration_s}
                        time={time}
                        notice={m.status === 'draft' ? t('route.draftNotice') : undefined}
                        labels={labels}
                        units={units}
                        onPress={() => onOpen(m.id)}
                    />
                );
            })}
        </YStack>
    );
}

/** The route itself: header, list or map, and the one action. */
function RouteView({
    manifestId,
    readOnly,
    onBack,
    onOpenStop,
    onOptimise,
    onNavigate,
}: {
    manifestId: string;
    readOnly: boolean;
    onBack?: () => void;
    onOpenStop?: (stopId: string) => void;
    onOptimise?: () => void;
    onNavigate?: RouteScreenProps['onNavigate'];
}) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { units } = useSettings();
    const scheme = useResolvedScheme();
    const { isOnline } = useSync();
    const position = useDeviceLocation();
    const { manifest, stops, isLoading, failed, error, refresh, isRefreshing, retry } = useManifest(manifestId);

    const [view, setView] = useState<View>('list');
    const [showCompleted, setShowCompleted] = useState(false);
    const [fitToken, setFitToken] = useState(0);

    const progress = manifestProgress(manifest);
    const current = currentManifestStop(stops);
    const completed = stops.filter(isStopDone);
    const remaining = stops.filter((s) => !isStopDone(s));
    const remainingDistanceM = remaining.reduce((sum, s) => sum + (Number(s.distance_from_prev_m) || 0), 0) || manifest?.total_distance_m;
    const finishAt = [...remaining].reverse().find((s) => s.estimated_arrival)?.estimated_arrival;
    const canOptimise = !readOnly && remaining.length >= 3 && Boolean(onOptimise);
    const currentPoint = coordsOfStop(current);
    const placeable = useMemo(() => placeableStops(stops), [stops]);

    const views = useMemo(
        () => [
            { value: 'list' as const, label: t('route.viewList') },
            { value: 'map' as const, label: t('route.viewMap') },
        ],
        [t]
    );

    const navigateToCurrent = useCallback(() => {
        if (!current || !currentPoint || !onNavigate) return;
        onNavigate({ ...currentPoint, label: current.place?.name ?? current.place?.address ?? undefined });
    }, [current, currentPoint, onNavigate]);

    const title = manifest?.vehicle_name ?? manifest?.id ?? '';

    const header = (
        <Surface hero padded testID="route-header">
            <YStack gap={space[3]}>
                <XStack justifyContent="space-between" alignItems="flex-start" gap={space[2]}>
                    <YStack flex={1} gap={2}>
                        <Heading fontSize={21}>{title}</Heading>
                        <Secondary fontSize={13} tabular>
                            {[
                                t('route.stopsLeft', { count: progress.pending }),
                                remainingDistanceM != null ? formatMeters(remainingDistanceM, units) : null,
                                finishAt ? t('route.finishAround', { time: formatClock(finishAt) }) : null,
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                        </Secondary>
                    </YStack>
                    <StatusPill status={manifest?.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} />
                </XStack>
                {manifest?.id ? <Identifier value={manifest.id} boxed={false} /> : null}
                <RouteProgress total={progress.total} completed={progress.completed} currentIndex={progress.currentIndex} testID="route-progress" />
                <Segmented options={views} value={view} onChange={setView} testID="route-view" />
            </YStack>
        </Surface>
    );

    if (isLoading && !stops.length) {
        return (
            <YStack flex={1} padding={space[4]} gap={space[3]} testID="route-loading">
                <Skeleton height={140} />
                <Skeleton height={96} />
                <Skeleton height={96} />
            </YStack>
        );
    }

    if (failed && !stops.length) {
        return (
            <YStack flex={1} padding={space[4]} justifyContent="center">
                <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="route-error" />
            </YStack>
        );
    }

    if (view === 'map') {
        return (
            <YStack flex={1} testID="route-map-view">
                <YStack padding={space[4]} paddingBottom={space[2]}>
                    {header}
                </YStack>
                <YStack flex={1} minHeight={240}>
                    {placeable.length ? (
                        <RouteMap
                            stops={stops}
                            currentStopId={current?.id}
                            position={position}
                            dark={scheme !== 'light' && scheme !== 'sunlight'}
                            fitToken={fitToken}
                            onPressStop={onOpenStop ? (s) => onOpenStop(s.id) : undefined}
                        />
                    ) : (
                        <YStack padding={space[4]}>
                            <EmptyState title={t('route.noPositions')} testID="route-map-empty" />
                        </YStack>
                    )}
                    <XStack position="absolute" top={space[3]} right={space[3]} gap={space[2]}>
                        <Button variant="secondary" height={40} paddingHorizontal={space[3]} onPress={() => setFitToken((n) => n + 1)} testID="route-recenter">
                            {t('route.recenter')}
                        </Button>
                        {canOptimise ? (
                            <Button variant="secondary" height={40} paddingHorizontal={space[3]} onPress={onOptimise} disabled={!isOnline} testID="route-optimise-map">
                                {t('route.optimise')}
                            </Button>
                        ) : null}
                    </XStack>
                    {current ? (
                        <YStack position="absolute" left={space[3]} right={space[3]} bottom={space[3]}>
                            <Surface level="mapOverlay" hero padded testID="route-next-stop">
                                <YStack gap={space[2]}>
                                    <XStack gap={space[3]} alignItems="center">
                                        <Body fontSize={20} fontWeight="800" tabular tone="brand">
                                            {current.sequence}
                                        </Body>
                                        <YStack flex={1}>
                                            <Body fontSize={16} fontWeight="700" numberOfLines={1}>
                                                {current.place?.name ?? t('route.unnamedStop', { sequence: current.sequence })}
                                            </Body>
                                            {current.place?.address ? <Secondary fontSize={13}>{current.place.address}</Secondary> : null}
                                        </YStack>
                                    </XStack>
                                    {current.order?.tracking_number ? <Identifier value={current.order.tracking_number} boxed={false} /> : null}
                                    <XStack justifyContent="space-between" alignItems="flex-end" gap={space[3]}>
                                        <YStack>
                                            <Body fontSize={18} fontWeight="800" tabular>
                                                {current.estimated_arrival ? formatClock(current.estimated_arrival) : '—'}
                                            </Body>
                                            <Micro tabular>
                                                {t('route.etaDistance', {
                                                    distance: current.distance_from_prev_m != null ? formatMeters(current.distance_from_prev_m, units) : '—',
                                                })}
                                            </Micro>
                                        </YStack>
                                        {!readOnly && currentPoint && onNavigate ? (
                                            <Button onPress={navigateToCurrent} testID="route-navigate">
                                                {t('route.navigate')}
                                            </Button>
                                        ) : null}
                                    </XStack>
                                </YStack>
                            </Surface>
                        </YStack>
                    ) : null}
                </YStack>
            </YStack>
        );
    }

    return (
        <YStack flex={1} testID="route-list-view">
            <ScrollView
                style={screen}
                contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: space[7] }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
            >
                {onBack ? (
                    <Button variant="ghost" alignSelf="flex-start" onPress={onBack} testID="route-back">
                        ‹ {t('route.backToManifests')}
                    </Button>
                ) : null}
                {header}

                {manifest?.status === 'cancelled' ? <Banner tone="neutral" message={t('route.routeCancelled')} testID="route-cancelled" /> : null}

                {!stops.length ? <EmptyState title={t('route.noStops')} testID="route-no-stops" /> : null}

                {completed.length && !readOnly ? (
                    <XStack
                        justifyContent="space-between"
                        alignItems="center"
                        paddingHorizontal={space[1]}
                        onPress={() => setShowCompleted((v) => !v)}
                        accessibilityRole="button"
                        testID="route-completed-toggle"
                    >
                        <Micro>{t('route.completedCount', { count: completed.length })}</Micro>
                        <Micro tone="brand">{showCompleted ? t('route.hide') : t('route.show')}</Micro>
                    </XStack>
                ) : null}

                {stops.map((stop) => {
                    const done = isStopDone(stop);
                    if (done && !readOnly && !showCompleted) return null;
                    return (
                        <StopRow
                            key={stop.id}
                            testID={`route-stop-${stop.id}`}
                            sequence={stop.sequence ?? 0}
                            name={stop.place?.name ?? stop.place?.address ?? t('route.unnamedStop', { sequence: stop.sequence })}
                            address={stop.place?.name ? stop.place?.address ?? undefined : undefined}
                            trackingNumber={stop.order?.tracking_number ?? undefined}
                            eta={stop.estimated_arrival ? formatClock(stop.estimated_arrival) : undefined}
                            distanceFromPrevM={stop.distance_from_prev_m ?? undefined}
                            durationFromPrevS={stop.duration_from_prev_s ?? undefined}
                            state={done ? 'completed' : stop.id === current?.id ? 'current' : 'pending'}
                            completedAt={stop.status === 'skipped' ? t('stopDetail.skippedNotice') : stop.actual_arrival ? formatClock(stop.actual_arrival) : undefined}
                            units={units}
                            onPress={onOpenStop ? () => onOpenStop(stop.id) : undefined}
                        />
                    );
                })}

                {stops.length && !remaining.length ? <Banner tone="success" message={t('route.allDone')} testID="route-all-done" /> : null}
            </ScrollView>

            {!readOnly && (current || canOptimise) ? (
                <YStack padding={space[4]} gap={space[2]} borderTopWidth={1} borderColor="$border" backgroundColor="$surface" testID="route-actions">
                    {current && currentPoint && onNavigate ? (
                        <Button onPress={navigateToCurrent} testID="route-navigate">
                            {t('stopDetail.navigateTo', { sequence: current.sequence })}
                        </Button>
                    ) : null}
                    {canOptimise ? (
                        <Button variant="secondary" onPress={onOptimise} disabled={!isOnline} testID="route-optimise">
                            {t('route.optimise')}
                        </Button>
                    ) : null}
                </YStack>
            ) : null}
        </YStack>
    );
}

export function RouteScreen({ driverId, reloadToken = 0, onOpenStop, onOptimise, onNavigate }: RouteScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { units } = useSettings();
    const { isOnline } = useSync();
    const { manifests, isLoading, failed, error, retry, refresh, isRefreshing } = useManifests(driverId, reloadToken);

    const [bucket, setBucket] = useState<ManifestBucket>('today');
    const [selectedId, setSelectedId] = useState<string | undefined>();

    const groups = useMemo(() => groupManifests(manifests), [manifests]);
    const inBucket = groups[bucket];

    /*
     * One manifest today opens straight into the route. The driver is not
     * asked to pick from a list of one, and a route that has since been
     * cancelled or replaced falls back to the list rather than staying open.
     */
    const autoId = bucket === 'today' && inBucket.length === 1 ? inBucket[0].id : undefined;
    const openId = selectedId && inBucket.some((m) => m.id === selectedId) ? selectedId : autoId;

    useEffect(() => {
        setSelectedId(undefined);
    }, [bucket]);

    const segments = useMemo(
        () => [
            { value: 'today' as const, label: t('route.segmentToday') },
            { value: 'upcoming' as const, label: t('route.segmentUpcoming') },
            { value: 'past' as const, label: t('route.segmentPast') },
        ],
        [t]
    );

    const picker = (
        <YStack paddingHorizontal={space[4]} paddingTop={space[3]} paddingBottom={space[2]}>
            <Segmented options={segments} value={bucket} onChange={setBucket} testID="route-bucket" />
        </YStack>
    );

    if (openId) {
        return (
            <YStack flex={1} backgroundColor="$background" testID="route-screen">
                {picker}
                <RouteView
                    manifestId={openId}
                    readOnly={bucket !== 'today'}
                    onBack={autoId ? undefined : () => setSelectedId(undefined)}
                    onOpenStop={onOpenStop ? (stopId) => onOpenStop(openId, stopId) : undefined}
                    onOptimise={onOptimise ? () => onOptimise(openId) : undefined}
                    onNavigate={onNavigate}
                />
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor="$background" testID="route-screen">
            {picker}
            <ScrollView
                style={screen}
                contentContainerStyle={{ padding: space[4], paddingTop: space[2], gap: space[3] }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
            >
                {isLoading ? (
                    <YStack gap={space[3]} testID="route-manifests-loading">
                        <Skeleton height={150} />
                        <Skeleton height={150} />
                    </YStack>
                ) : failed && !manifests.length ? (
                    <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="route-manifests-error" />
                ) : (
                    <ManifestList manifests={inBucket} bucket={bucket} units={units} onOpen={setSelectedId} t={t} />
                )}
            </ScrollView>
        </YStack>
    );
}

export default RouteScreen;
