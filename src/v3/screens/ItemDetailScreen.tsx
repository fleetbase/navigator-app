/**
 * Item detail — R2 frame D4.
 *
 * The frame calls for a photo carousel, the tracking number, a scannable
 * barcode, dimensions, weight, price, destination and scan history. A live
 * instance supplies a *single* `photo_url` (not a set), so the carousel
 * degrades to one image rather than faking additional frames.
 *
 * The barcode is real: the entity's tracking number carries `barcode` and
 * `qr_code` as bare base64 PNGs — no `data:` prefix — which is why they are
 * wrapped below before being handed to <Image>.
 *
 * Most entity metadata is nullable and, on the dev instance, usually null.
 * That is D4's "minimal metadata" state: rows with no value are omitted and
 * the screen says so, instead of printing a column of em dashes.
 */
import { useMemo } from 'react';
import { Image, ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, EmptyState, ErrorState, Skeleton } from '../ui/Banner';
import { space, radius } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import {
    useEntity,
    useScanHistory,
    trackingRecordIdOf,
    entityIdOf,
    entityNameOf,
    entityDamagedOf,
    entityTrackingNumberOf,
    type EntityRecord,
    type ScanEvent,
} from '../data';
import { useSync } from '../shell';
import { formatMoney, formatWeight, formatDimensions, formatClock } from '../format';

/** The API returns bare base64; <Image> needs the data URI. */
function pngSource(base64?: unknown) {
    return typeof base64 === 'string' && base64 ? { uri: `data:image/png;base64,${base64}` } : undefined;
}

function str(value: unknown): string | undefined {
    if (typeof value === 'string') return value.trim() || undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return undefined;
}

/** A place can arrive as an id string or an expanded object. */
function placeLabelOf(value: unknown): string | undefined {
    if (typeof value === 'string') return value || undefined;
    if (value && typeof value === 'object') {
        const p = value as { name?: unknown; address?: unknown; street1?: unknown };
        return str(p.name) ?? str(p.address) ?? str(p.street1);
    }
    return undefined;
}

interface MetaRow {
    key: string;
    labelKey: string;
    value: string;
    mono?: boolean;
}

export function ItemDetailScreen({
    entityId,
    entity: seed,
    onEdit,
    onBack,
}: {
    entityId?: string;
    /** The copy already in the order payload, so the screen paints instantly. */
    entity?: EntityRecord | null;
    onEdit?: (entity: { id: string; name?: string }) => void;
    onBack?: () => void;
}) {
    const { t } = useTranslation();
    const { isOnline } = useSync();

    const { entity, isLoading, isBlocked, error, retry } = useEntity(entityId, seed);
    const trackingRecordId = trackingRecordIdOf(entity);
    const { events, isLoading: historyLoading, failed: historyFailed, retry: retryHistory } = useScanHistory(trackingRecordId);

    const rows = useMemo<MetaRow[]>(() => {
        if (!entity) return [];
        const tn = entity.tracking_number as { status?: unknown } | null | undefined;

        const candidates: (MetaRow | null)[] = [
            str(entity.sku) ? { key: 'sku', labelKey: 'itemDetail.sku', value: str(entity.sku)!, mono: true } : null,
            str(entity.internal_id)
                ? { key: 'internalId', labelKey: 'itemDetail.internalId', value: str(entity.internal_id)!, mono: true }
                : null,
            str(entity.type) ? { key: 'type', labelKey: 'itemDetail.type', value: str(entity.type)! } : null,
            (() => {
                const dims = formatDimensions(
                    entity.length as string,
                    entity.width as string,
                    entity.height as string,
                    entity.dimensions_unit as string
                );
                return dims ? { key: 'dimensions', labelKey: 'itemDetail.dimensions', value: dims, mono: true } : null;
            })(),
            entity.weight != null
                ? {
                      key: 'weight',
                      labelKey: 'itemDetail.weight',
                      value: formatWeight(entity.weight as string, entity.weight_unit as string),
                      mono: true,
                  }
                : null,
            entity.price != null
                ? {
                      key: 'price',
                      labelKey: 'itemDetail.price',
                      value: formatMoney(entity.price as string, entity.currency as string),
                      mono: true,
                  }
                : null,
            entity.declared_value != null
                ? {
                      key: 'declaredValue',
                      labelKey: 'itemDetail.declaredValue',
                      value: formatMoney(entity.declared_value as string, entity.currency as string),
                      mono: true,
                  }
                : null,
            placeLabelOf(entity.destination)
                ? { key: 'destination', labelKey: 'itemDetail.destination', value: placeLabelOf(entity.destination)! }
                : null,
            str((entity.customer as { name?: unknown } | null | undefined)?.name)
                ? {
                      key: 'customer',
                      labelKey: 'itemDetail.customer',
                      value: str((entity.customer as { name?: unknown }).name)!,
                  }
                : null,
            str(tn?.status) ? { key: 'trackingStatus', labelKey: 'itemDetail.trackingStatus', value: str(tn!.status)! } : null,
        ];

        return candidates.filter((r): r is MetaRow => r !== null);
    }, [entity]);

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="item-detail-loading">
                <Skeleton height={72} />
                <Skeleton height={160} />
                <Skeleton height={200} />
            </YStack>
        );
    }

    if (isBlocked || !entity) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="item-detail-error">
                <ErrorState
                    title={t('itemDetail.loadFailed')}
                    body={error?.message ?? t('itemDetail.loadFailedBody')}
                    onRetry={retry}
                    retryLabel={t('common.retry')}
                />
            </YStack>
        );
    }

    const id = entityIdOf(entity);
    const name = entityNameOf(entity);
    const tracking = entityTrackingNumberOf(entity);
    const damaged = entityDamagedOf(entity);
    const photo = str(entity.photo_url);
    const trackingNumber = entity.tracking_number as Record<string, unknown> | null | undefined;
    const barcode = pngSource(trackingNumber?.barcode);
    const qr = pngSource(trackingNumber?.qr_code);
    const description = str(entity.description);

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="item-detail">
            {!isOnline ? <Banner tone="neutral" message={t('itemDetail.offlineCached')} testID="item-offline" /> : null}

            {damaged ? (
                <Banner tone="danger" message={t('itemDetail.damagedFlagged')} meta={t('itemDetail.damagedHint')} testID="item-damaged" />
            ) : null}

            <YStack gap={space[2]}>
                <XStack justifyContent="space-between" alignItems="center" gap={space[3]}>
                    <Body fontSize={17} fontWeight="800" flex={1}>
                        {name ?? t('itemDetail.untitled')}
                    </Body>
                    {damaged ? <StatusPill status="damaged" label={t('itemDetail.damagedPill')} size="sm" testID="damaged-pill" /> : null}
                </XStack>
                {tracking ? <Identifier value={tracking} label={t('itemDetail.trackingNumberLabel')} /> : null}
                {description ? <Secondary fontSize={13}>{description}</Secondary> : null}
            </YStack>

            {/* D4 draws a carousel; the API exposes one photo, so one is shown. */}
            {photo ? (
                <Surface overflow="hidden" testID="item-photo">
                    <Image source={{ uri: photo }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
                </Surface>
            ) : null}

            <Surface testID="item-meta">
                {rows.length === 0 ? (
                    <YStack padding={space[3]}>
                        <Micro testID="minimal-metadata">{t('itemDetail.minimalMetadata')}</Micro>
                    </YStack>
                ) : (
                    rows.map((row, i) => (
                        <YStack key={row.key}>
                            {i > 0 ? <Divider /> : null}
                            <XStack
                                padding={space[3]}
                                gap={space[3]}
                                justifyContent="space-between"
                                alignItems="center"
                                testID={`meta-${row.key}`}
                            >
                                <Caption>{t(row.labelKey)}</Caption>
                                <Body fontSize={15} tabular={row.mono} textAlign="right" flexShrink={1}>
                                    {row.value}
                                </Body>
                            </XStack>
                        </YStack>
                    ))
                )}
            </Surface>

            {barcode || qr ? (
                <Surface padded testID="item-barcode">
                    <YStack gap={space[3]} alignItems="center">
                        <Caption>{t('itemDetail.scanLabel')}</Caption>
                        {barcode ? (
                            <Image
                                source={barcode}
                                style={{ width: '100%', height: 72, borderRadius: radius.compact }}
                                resizeMode="contain"
                                accessibilityLabel={t('itemDetail.barcodeAlt')}
                            />
                        ) : null}
                        {qr ? (
                            <Image
                                source={qr}
                                style={{ width: 120, height: 120 }}
                                resizeMode="contain"
                                accessibilityLabel={t('itemDetail.qrAlt')}
                            />
                        ) : null}
                    </YStack>
                </Surface>
            ) : null}

            <YStack gap={space[2]}>
                <Caption>{t('itemDetail.scanHistory')}</Caption>
                {historyLoading ? (
                    <Skeleton height={96} testID="history-loading" />
                ) : historyFailed ? (
                    <ErrorState
                        title={t('itemDetail.historyUnavailable')}
                        body={t('itemDetail.historyUnavailableBody')}
                        onRetry={retryHistory}
                        retryLabel={t('common.retry')}
                        testID="history-error"
                    />
                ) : !events || events.length === 0 ? (
                    <EmptyState
                        title={t('itemDetail.noScansTitle')}
                        body={trackingRecordId ? t('itemDetail.noScansBody') : t('itemDetail.noTrackingNumberBody')}
                        testID="history-empty"
                    />
                ) : (
                    <Surface testID="scan-history">
                        {events.map((event: ScanEvent, i) => (
                            <YStack key={event.id ?? i}>
                                {i > 0 ? <Divider /> : null}
                                <XStack padding={space[3]} gap={space[3]} alignItems="flex-start" testID={`scan-${event.id ?? i}`}>
                                    <YStack flex={1} gap={2}>
                                        <XStack gap={space[2]} alignItems="center">
                                            <StatusPill status={event.code} label={event.status} size="sm" />
                                        </XStack>
                                        {event.details ? <Secondary fontSize={13}>{event.details}</Secondary> : null}
                                        {[event.city, event.province, event.country].filter(Boolean).length ? (
                                            <Micro>{[event.city, event.province, event.country].filter(Boolean).join(', ')}</Micro>
                                        ) : null}
                                    </YStack>
                                    <Micro tabular>{formatClock(event.created_at)}</Micro>
                                </XStack>
                            </YStack>
                        ))}
                    </Surface>
                )}
            </YStack>

            <XStack gap={space[2]}>
                {onBack ? (
                    <Button flex={1} variant="ghost" onPress={onBack} testID="item-back">
                        {t('common.back')}
                    </Button>
                ) : null}
                {onEdit && id ? (
                    <Button flex={2} variant="secondary" onPress={() => onEdit({ id, name })} testID="item-edit">
                        {t('itemDetail.edit')}
                    </Button>
                ) : null}
            </XStack>
        </ScrollView>
    );
}

export default ItemDetailScreen;
