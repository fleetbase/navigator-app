/**
 * Optimise preview — R2 frame B3, before / after.
 *
 * The server's optimise applies as soon as it is called; there is no dry
 * run. The frame asks the driver to confirm a proposal, so the proposal is
 * computed here with the server's own nearest-first walk (see routeGeo) from
 * the driver's position, and the server is called only on Apply. It then
 * answers with the manifest it stored, which replaces the preview — if the
 * two ever disagree, the server is right and the route shows what it has.
 *
 * The numbers are straight-line, and say so. Time saved is estimated at the
 * plan's own average speed and is omitted when the plan has no totals.
 */
import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Heading, Micro, Secondary } from '../ui/Text';
import { Surface } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSettings } from '../settings';
import { useSync, useDeviceLocation } from '../shell';
import { useManifest, useOptimiseManifest, previewOptimise, isStopDone, type ManifestStopRecord } from '../data';
import { formatDuration, formatMeters } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';

export interface OptimisePreviewScreenProps {
    manifestId: string;
    onDone?: () => void;
}

function Column({ label, stops, moved, testID }: { label: string; stops: ManifestStopRecord[]; moved: Set<string>; testID: string }) {
    return (
        <YStack flex={1} gap={space[2]} testID={testID}>
            <Micro fontSize={10}>{label}</Micro>
            {stops.map((s) => {
                const done = isStopDone(s);
                const changed = moved.has(s.id);
                return (
                    <XStack key={s.id} gap={space[2]} alignItems="center" opacity={done ? 0.5 : 1} testID={`${testID}-${s.id}`}>
                        <Body fontSize={13} fontWeight="800" tabular tone={changed ? 'brand' : 'secondary'} width={22}>
                            {s.sequence}
                        </Body>
                        <Body fontSize={13} fontWeight={changed ? '700' : '500'} numberOfLines={1} flex={1}>
                            {s.place?.name ?? s.place?.address ?? s.id}
                        </Body>
                        {changed && !done ? (
                            <Micro tone="brand" fontSize={12}>
                                ⇅
                            </Micro>
                        ) : null}
                    </XStack>
                );
            })}
        </YStack>
    );
}

function Stat({ value, label, tone, testID }: { value: string; label: string; tone?: 'success' | 'danger' | 'primary'; testID?: string }) {
    return (
        <YStack flex={1} gap={2} testID={testID}>
            <Body fontSize={24} fontWeight="800" tabular tone={tone ?? 'primary'}>
                {value}
            </Body>
            <Micro fontSize={10}>{label}</Micro>
        </YStack>
    );
}

const signed = (n: number, format: (abs: number) => string) => `${n < 0 ? '−' : '+'}${format(Math.abs(n))}`;

export function OptimisePreviewScreen({ manifestId, onDone }: OptimisePreviewScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { units } = useSettings();
    const { isOnline } = useSync();
    const position = useDeviceLocation();
    const { manifest, stops, isLoading, failed, error, retry } = useManifest(manifestId);
    const { apply, isApplying, error: applyError } = useOptimiseManifest(manifestId);
    const [applyFailed, setApplyFailed] = useState(false);

    const preview = useMemo(() => previewOptimise(manifest, position ?? undefined), [manifest, position]);
    const remaining = stops.filter((s) => !isStopDone(s));

    const confirm = useCallback(async () => {
        setApplyFailed(false);
        const outcome = await apply(position);
        if (outcome === 'applied') onDone?.();
        else setApplyFailed(true);
    }, [apply, onDone, position]);

    if (isLoading && !stops.length) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="optimise-loading">
                <Skeleton height={80} />
                <Skeleton height={240} />
            </YStack>
        );
    }

    if (failed && !stops.length) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center">
                <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="optimise-error" />
            </YStack>
        );
    }

    /* The calm states the frame's footnote promises. */
    const calm =
        !isOnline
            ? { title: t('optimise.offlineTitle'), body: t('optimise.offlineBody'), id: 'offline' }
            : remaining.length < 3
              ? { title: t('optimise.tooFewTitle'), body: t('optimise.tooFewBody'), id: 'too-few' }
              : preview.unchanged
                ? { title: t('optimise.unchangedTitle'), body: t('optimise.unchangedBody'), id: 'unchanged' }
                : null;

    if (calm) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[4]} justifyContent="center" testID={`optimise-${calm.id}`}>
                <EmptyState title={calm.title} body={calm.body} />
                <Button variant="secondary" onPress={onDone} testID="optimise-close">
                    {t('common.done')}
                </Button>
            </YStack>
        );
    }

    const worse = preview.deltaM != null && preview.deltaM > 0;

    return (
        <YStack flex={1} backgroundColor="$background" testID="optimise-preview">
            <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: space[7] }}>
                <YStack gap={space[1]}>
                    <Heading fontSize={20}>{t('optimise.title')}</Heading>
                    <Secondary fontSize={13}>{t('optimise.subtitle', { count: remaining.length })}</Secondary>
                </YStack>

                <Surface hero padded>
                    <XStack gap={space[3]}>
                        {preview.deltaS != null ? (
                            <Stat value={signed(preview.deltaS, formatDuration)} label={t('optimise.timeSaved')} tone={preview.deltaS <= 0 ? 'success' : 'danger'} testID="optimise-time" />
                        ) : null}
                        {preview.deltaM != null ? (
                            <Stat value={signed(preview.deltaM, (m) => formatMeters(m, units))} label={t('optimise.distanceSaved')} tone={worse ? 'danger' : 'success'} testID="optimise-distance" />
                        ) : null}
                        <Stat value={String(preview.moved.size)} label={t('optimise.moved')} testID="optimise-moved" />
                    </XStack>
                </Surface>

                {worse ? <Banner tone="warning" message={t('optimise.worse')} testID="optimise-worse" /> : null}
                {!position ? <Banner tone="neutral" message={t('optimise.noPositionNote')} testID="optimise-no-position" /> : null}
                {applyFailed ? <Banner tone="danger" message={applyError?.message ? `${t('optimise.failed')} ${applyError.message}` : t('optimise.failed')} testID="optimise-failed" /> : null}

                <Surface padded="compact">
                    <XStack gap={space[4]}>
                        <Column label={t('optimise.current')} stops={preview.before} moved={preview.moved} testID="optimise-before" />
                        <YStack width={1} backgroundColor="$border" />
                        <Column label={t('optimise.proposed')} stops={preview.after} moved={preview.moved} testID="optimise-after" />
                    </XStack>
                    <XStack marginTop={space[3]} gap={space[4]}>
                        <Micro flex={1} tabular>
                            {preview.beforeLengthM != null ? formatMeters(preview.beforeLengthM, units) : '—'}
                        </Micro>
                        <Micro flex={1} tabular>
                            {preview.afterLengthM != null ? formatMeters(preview.afterLengthM, units) : '—'}
                        </Micro>
                    </XStack>
                </Surface>

                <Micro>{t('optimise.estimate')}</Micro>
            </ScrollView>

            <XStack padding={space[4]} gap={space[2]} borderTopWidth={1} borderColor="$border" backgroundColor="$surface" testID="optimise-actions">
                <Button flex={1} variant="secondary" onPress={onDone} disabled={isApplying} testID="optimise-discard">
                    {t('optimise.discard')}
                </Button>
                <Button flex={1} onPress={() => void confirm()} loading={isApplying} testID="optimise-apply">
                    {t('optimise.apply')}
                </Button>
            </XStack>
        </YStack>
    );
}

export default OptimisePreviewScreen;
