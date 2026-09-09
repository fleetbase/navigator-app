/**
 * Trailer detail — the read view. No design frame exists for trailers (the
 * feature postdates both rounds), so this is composed strictly from the
 * Waypoint system: identity card with identifiers on their own lines, a
 * status pill that pairs hue with shape, and label/value rows grouped the way
 * a driver walks round the unit — towing, size and weight, running gear,
 * refrigeration, telematics. The written spec is docs/redesign/09-TRAILERS-SPEC.md.
 *
 * Read-only on purpose. Whether a driver couples and uncouples from the app
 * is the owner's call (§12.1); until then the screen says who does.
 */
import { ScrollView, Image } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Banner, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { radius, space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { endAlign } from '../i18n/direction';
import { useSync } from '../shell';
import { useTrailer, trailerTitle, trainPositionOf, reeferRangeOf, type TrailerRecord } from '../data';
import { formatDateTime, formatNumber } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';

export interface TrailerDetailScreenProps {
    trailerId: string;
    /** The row's copy, so the screen paints before the fetch lands. */
    seed?: TrailerRecord | null;
}

type Row = { key: string; label: string; value: string; mono?: boolean };

function Group({ title, rows, testID }: { title: string; rows: Row[]; testID: string }) {
    if (!rows.length) return null;
    return (
        <YStack gap={space[2]} testID={testID}>
            <Caption paddingHorizontal={space[1]}>{title}</Caption>
            <Surface>
                {rows.map((row, i) => (
                    <YStack key={row.key}>
                        {i > 0 ? <Divider /> : null}
                        {row.mono ? (
                            <YStack padding={space[3]} gap={space[1]} testID={`${testID}-${row.key}`}>
                                <Caption>{row.label}</Caption>
                                <Identifier value={row.value} boxed={false} />
                            </YStack>
                        ) : (
                            <XStack padding={space[3]} justifyContent="space-between" alignItems="center" gap={space[3]} testID={`${testID}-${row.key}`}>
                                <Caption>{row.label}</Caption>
                                <Body fontSize={15} textAlign={endAlign()} flexShrink={1} tabular>
                                    {row.value}
                                </Body>
                            </XStack>
                        )}
                    </YStack>
                ))}
            </Surface>
        </YStack>
    );
}

const present = (v: unknown) => v != null && v !== '' && !(typeof v === 'number' && Number.isNaN(v));

function measured(value: unknown, unit: string): string | undefined {
    if (!present(value)) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? `${formatNumber(n)} ${unit}` : `${String(value)} ${unit}`;
}

export function TrailerDetailScreen({ trailerId, seed }: TrailerDetailScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const { trailer, isLoading, failed, error, retry } = useTrailer(trailerId, seed);

    if (isLoading && !trailer) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="trailer-loading">
                <Skeleton height={120} />
                <Skeleton height={200} />
            </YStack>
        );
    }

    if (!trailer) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center">
                <FailureState error={failed ? error : { message: 'not found', status: 404 }} isOnline={isOnline} onRetry={retry} t={t} testID="trailer-error" />
            </YStack>
        );
    }

    const metric = (trailer.measurement_system ?? 'metric') !== 'imperial';
    const lengthUnit = metric ? 'm' : 'ft';
    const weightUnit = metric ? 'kg' : 'lb';
    const volumeUnit = metric ? 'm³' : 'ft³';
    const position = trainPositionOf(trailer);
    const reefer = reeferRangeOf(trailer);
    const yes = (v: boolean | null | undefined) => (v == null ? undefined : v ? t('trailer.yes') : t('trailer.no'));
    const row = (key: string, label: string, value?: string, mono = false): Row | null => (value ? { key, label, value, mono } : null);
    const rows = (list: (Row | null)[]) => list.filter(Boolean) as Row[];

    const towing = rows([
        row('vehicle', t('trailer.towedBy'), trailer.current_vehicle_name ?? trailer.current_connection?.vehicle?.name ?? undefined),
        row('position', t('trailer.position'), position != null ? t('trailer.positionValue', { position }) : undefined),
        row('attachedAt', t('trailer.attachedAt'), trailer.attached_at ?? trailer.current_connection?.connected_at ? formatDateTime(trailer.attached_at ?? trailer.current_connection?.connected_at) : undefined),
        row('coupling', t('trailer.couplingType'), trailer.coupling_type ?? undefined),
    ]);
    const size = rows([
        row('length', t('trailer.length'), measured(trailer.length, lengthUnit)),
        row('width', t('trailer.width'), measured(trailer.width, lengthUnit)),
        row('height', t('trailer.height'), measured(trailer.height, lengthUnit)),
        row('tare', t('trailer.tareWeight'), measured(trailer.tare_weight, weightUnit)),
        row('gvwr', t('trailer.gvwr'), measured(trailer.gvwr, weightUnit)),
        row('payload', t('trailer.payloadCapacity'), measured(trailer.payload_capacity, weightUnit)),
        row('volume', t('trailer.cargoVolume'), measured(trailer.cargo_volume, volumeUnit)),
    ]);
    const gear = rows([
        row('axles', t('trailer.axles'), present(trailer.axle_count) ? String(trailer.axle_count) : undefined),
        row('tyres', t('trailer.tyres'), present(trailer.tire_count) ? String(trailer.tire_count) : undefined),
        row('doors', t('trailer.doors'), present(trailer.door_count) ? String(trailer.door_count) : undefined),
        row('brakes', t('trailer.brakeType'), trailer.brake_type ?? undefined),
        row('abs', t('trailer.abs'), yes(trailer.abs_equipped)),
        row('ebs', t('trailer.ebs'), yes(trailer.ebs_equipped)),
    ]);
    const cold = trailer.refrigerated
        ? rows([
              row('range', t('trailer.temperatureRange'), reefer),
              row('reeferHours', t('trailer.reeferHours'), present(trailer.reefer_engine_hours) ? `${formatNumber(trailer.reefer_engine_hours)} h` : undefined),
          ])
        : [];
    const telematics = rows([
        row('online', t('trailer.online'), trailer.online == null ? undefined : trailer.online ? t('trailer.onlineNow') : t('trailer.offline')),
        row('lastOnline', t('trailer.lastOnline'), trailer.last_online_at ? formatDateTime(trailer.last_online_at) : undefined),
        row('odometer', t('trailer.odometer'), present(trailer.odometer) ? `${formatNumber(trailer.odometer)} ${trailer.odometer_unit ?? 'km'}` : undefined),
        row('engineHours', t('trailer.engineHours'), present(trailer.engine_hours) ? `${formatNumber(trailer.engine_hours)} h` : undefined),
    ]);
    const identity = rows([
        row('plate', t('trailer.plate'), trailer.plate_number ?? undefined, true),
        row('vin', t('trailer.vin'), trailer.vin ?? undefined, true),
        row('serial', t('trailer.serial'), trailer.serial_number ?? undefined, true),
        row('code', t('trailer.code'), trailer.code ?? undefined, true),
    ]);
    const makeModel = [trailer.make, trailer.model, trailer.year].filter(present).join(' ');
    const kind = [trailer.type, trailer.body_type].filter(present).join(' · ');

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: space[7] }} testID="trailer-detail">
            <Surface hero padded testID="trailer-identity">
                <XStack gap={space[3]} alignItems="center">
                    {trailer.photo_url ? <Image source={{ uri: trailer.photo_url }} style={{ width: 56, height: 56, borderRadius: radius.compact }} /> : null}
                    <YStack flex={1} gap={space[1]}>
                        <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                            <Body fontSize={17} fontWeight="800" flex={1} numberOfLines={1}>
                                {trailerTitle(trailer) ?? t('trailer.unnamed')}
                            </Body>
                            {trailer.attachment_state ? (
                                <StatusPill status={trailer.attachment_state} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} testID="trailer-attachment" />
                            ) : null}
                        </XStack>
                        {kind ? <Secondary fontSize={13}>{kind}</Secondary> : null}
                        {makeModel ? <Micro>{makeModel}</Micro> : null}
                        {reefer ? (
                            <Micro tone="brand" tabular testID="trailer-reefer">
                                {t('trailer.refrigerated')} · {reefer}
                            </Micro>
                        ) : null}
                    </YStack>
                </XStack>
            </Surface>

            <Group title={t('trailer.identity')} rows={identity} testID="trailer-ids" />
            <Group title={t('trailer.towing')} rows={towing} testID="trailer-towing" />
            <Group title={t('trailer.sizeAndWeight')} rows={size} testID="trailer-size" />
            <Group title={t('trailer.runningGear')} rows={gear} testID="trailer-gear" />
            <Group title={t('trailer.refrigeration')} rows={cold} testID="trailer-cold" />
            <Group title={t('trailer.telematics')} rows={telematics} testID="trailer-telematics" />

            {!identity.length && !towing.length && !size.length && !gear.length && !telematics.length ? (
                <Secondary testID="trailer-sparse">{t('trailer.sparse')}</Secondary>
            ) : null}

            <Banner tone="neutral" message={t('trailer.couplingByDispatch')} testID="trailer-read-only" />
        </ScrollView>
    );
}

export default TrailerDetailScreen;
