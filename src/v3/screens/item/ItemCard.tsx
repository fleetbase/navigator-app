/**
 * One item of an order — design round 3 (ItemCombined.dc.html,
 * ItemCombinedScroll.dc.html, ItemCombinedScanned.dc.html).
 *
 * A card whose content scrolls over a footer that does not:
 *
 *   - the photo, edge to edge, scrolling away with the rest (tap it to see it
 *     full-screen);
 *   - name and id; the codes to be scanned; status (scanned or not, and the
 *     Damaged toggle); where the item is going; its note; its details, with a
 *     pencil on the ones the driver may change; files; metadata; and what has
 *     happened to its tracking number;
 *   - the footer: the scan state and the one action, Scan now.
 *
 * Only what the record carries is drawn: a section with nothing in it is left
 * out, and so is a field with no value (unless the driver may fill it in).
 *
 * Editing is in place. Which fields may change is the server's answer for the
 * order (`useEditableEntityFields`, asked once by whoever hosts the cards);
 * a change is the same request the edit screen makes, `PUT entities/{id}` with
 * only the field that changed, and it queues without signal the same way. The
 * Damaged toggle is that request too (`{ damaged }`).
 *
 * The card is shown by the pager modal over the order, and, on its own, by the
 * item screen (`ItemDetailScreen`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, type TextInput } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { XStack, YStack, useTheme } from 'tamagui';
import { ScrollView } from '../../ui/Scroll';
import { Body, Micro, Secondary } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Banner, ErrorState, Skeleton } from '../../ui/Banner';
import { FailureState } from '../../ui/FailureState';
import { StatusPill } from '../../ui/StatusPill';
import { StopBadge } from '../../ui/RouteMap';
import type { WaypointMarkerKind } from '../../ui/routeColors';
import { useTranslation } from '../../i18n/useTranslation';
import { useFleetbase, isQueuedAck } from '../../api';
import { useSync } from '../../shell';
import {
    useEntity,
    useScanHistory,
    trackingRecordIdOf,
    entityIdOf,
    entityNameOf,
    entityDamagedOf,
    entityTrackingNumberOf,
    entityQuantityOf,
    entityNoteOf,
    placeLines,
    type EntityRecord,
    type OrderStop,
    type ScanEvent,
} from '../../data';
import { entityScanIdOf, type ItemScan } from '../../data/useItemScans';
import { dayKey } from '../../data/orderStore';
import { formatClock, formatDateTime, formatDimensions, formatMoney, formatWeight } from '../../format';
import { Glyph, SectionLabel } from '../jobs/parts';
import { HomeIcon } from '../home/parts';

type T = (key: string, options?: Record<string, unknown>) => string;
type Rec = Record<string, unknown>;

/* -- Small readers. ---------------------------------------------------------- */

function str(value: unknown): string | undefined {
    if (typeof value === 'string') return value.trim() || undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return undefined;
}

function recordOf(value: unknown): Rec | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : undefined;
}

/** The API sends bare base64 with no `data:` prefix; an Image needs one. */
function pngSource(value: unknown): { uri: string } | undefined {
    const raw = typeof value === 'string' && value.trim() ? value : undefined;
    if (!raw) return undefined;
    return { uri: raw.startsWith('data:') || raw.startsWith('http') ? raw : `data:image/png;base64,${raw}` };
}

/** Today shows the clock alone; any other day needs its date. */
export function scanStamp(iso?: string | null): string {
    if (!iso) return '';
    return dayKey(iso) === dayKey() ? formatClock(iso) : formatDateTime(iso);
}

/** "storefront_product" reads as "Storefront product". */
function plainWords(value: string): string {
    const words = value.replace(/[_-]+/g, ' ').trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : value;
}

/** A formatter's em dash means "no value": the row is left out instead. */
function known(value: string | undefined): string | undefined {
    return value && value !== '—' ? value : undefined;
}

interface GoingTo {
    title?: string;
    address?: string;
    kind?: WaypointMarkerKind;
    number?: number;
}

/**
 * The waypoint the item is for. `destination` is a place id on the driver API
 * (an expanded place on some responses); it is matched against the order's own
 * waypoints so it can be named and marked the way the order's trip marks it.
 */
function goingToOf(entity: Rec, stops?: OrderStop[]): GoingTo | undefined {
    const raw = entity.destination;
    const place = recordOf(raw);
    const id = typeof raw === 'string' ? raw.trim() || undefined : (str(place?.id) ?? str(place?.public_id));
    let waypointNumber = 0;
    for (const stop of stops ?? []) {
        // A waypoint between the ends is numbered among the order's waypoints, as the console numbers it.
        const number = stop.type === 'waypoint' ? ++waypointNumber : undefined;
        if (id && stop.id === id) {
            const lines = placeLines(stop as unknown as Rec);
            return { title: lines.title, address: lines.address, kind: stop.type, number };
        }
    }
    if (place) {
        const lines = placeLines(place);
        if (lines.title) return { title: lines.title, address: lines.address };
    }
    return undefined;
}

interface ItemFile {
    id?: string;
    url?: string | null;
    original_filename?: string | null;
    content_type?: string | null;
    caption?: string | null;
}

function fileKind(file: ItemFile): string {
    const name = str(file.original_filename) ?? '';
    const ext = name.includes('.') ? name.split('.').pop() : undefined;
    const fromType = str(file.content_type)?.split('/').pop();
    return String(ext ?? fromType ?? 'file')
        .slice(0, 4)
        .toUpperCase();
}

/** Metadata already said elsewhere on the card. */
const META_SHOWN_ELSEWHERE = new Set(['damaged', 'quantity', 'note']);

function metaText(value: unknown): string | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') {
        const size = Array.isArray(value) ? value.length : Object.keys(value as Rec).length;
        return size ? JSON.stringify(value) : undefined;
    }
    return String(value);
}

/* -- Icons from the mockup. --------------------------------------------------- */

const ICON_PATHS = {
    scan: 'M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M4 12h16',
    pencil: 'M4 20l4-1L19 8l-3-3L5 16z',
    arrow: 'M5 12h14M13 6l6 6-6 6',
} as const;

export function ItemIcon({ name, size = 18, color, strokeWidth = 2.4 }: { name: keyof typeof ICON_PATHS; size?: number; color: string; strokeWidth?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no">
            <Path d={ICON_PATHS[name]} />
        </Svg>
    );
}

/** The dashed ring that stands for "not yet". */
function DashedRing({ size, color }: { size: number; color: string }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" accessibilityElementsHidden importantForAccessibility="no">
            <Circle cx={12} cy={12} r={8} strokeDasharray="3 4" />
        </Svg>
    );
}

/* -- Layout pieces. ------------------------------------------------------------ */

function Sect({ label, aside, children, testID }: { label: string; aside?: React.ReactNode; children: React.ReactNode; testID?: string }) {
    return (
        <YStack gap={8} testID={testID}>
            <XStack alignItems="center" justifyContent="space-between" gap={12}>
                <YStack flex={1}>
                    <SectionLabel>{label}</SectionLabel>
                </YStack>
                {aside}
            </XStack>
            {children}
        </YStack>
    );
}

function Panel({ children, testID, ...rest }: { children: React.ReactNode; testID?: string } & Rec) {
    return (
        <YStack borderRadius={18} backgroundColor="$surface" borderWidth={1} borderColor="$border" overflow="hidden" testID={testID} {...rest}>
            {children}
        </YStack>
    );
}

function Rule() {
    return <YStack height={1} backgroundColor="$border" />;
}

/** A field being changed: the app's own field, then Cancel and Save. */
function EditBlock({
    label,
    value,
    onChangeText,
    keyboard,
    tabular,
    multiline,
    placeholder,
    saving,
    error,
    onSave,
    onCancel,
    field,
    t,
}: {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    keyboard?: 'default' | 'numeric' | 'decimal-pad';
    tabular?: boolean;
    multiline?: boolean;
    placeholder?: string;
    saving: boolean;
    error?: string | null;
    onSave: () => void;
    onCancel: () => void;
    field: string;
    t: T;
}) {
    const input = useRef<TextInput>(null);
    // Focused once it is on screen, so the keyboard comes up with the field.
    useEffect(() => {
        const timer = setTimeout(() => input.current?.focus(), 80);
        return () => clearTimeout(timer);
    }, []);
    return (
        <YStack gap={10} paddingVertical={12} testID={`field-${field}`}>
            <Field ref={input} label={label} value={value} onChangeText={onChangeText} keyboardType={keyboard} tabular={tabular} multiline={multiline} placeholder={placeholder} testID={`input-${field}`} />
            {error ? (
                <YStack gap={2} testID="save-error">
                    <Body fontSize={14} lineHeight={19} fontWeight="700" tone="danger">
                        {t('editPayloadItem.saveFailed')}
                    </Body>
                    <Secondary fontSize={13} lineHeight={17}>
                        {error}
                    </Secondary>
                </YStack>
            ) : null}
            <XStack gap={8}>
                <Button flex={1} variant="ghost" disabled={saving} onPress={onCancel} testID="cancel-edit">
                    {t('common.cancel')}
                </Button>
                <Button flex={2} loading={saving} onPress={onSave} testID="save-edit">
                    {t('common.save')}
                </Button>
            </XStack>
        </YStack>
    );
}

interface DetailRow {
    /** The row's name in test ids (`meta-<id>`), as the item screen always had them. */
    id: string;
    /** The entity field a change is sent as, when the row can be edited at all. */
    field?: string;
    label: string;
    /** As shown. */
    value?: string;
    /** As edited: the raw value, the way the edit screen offers it. */
    raw?: string;
    mono?: boolean;
    keyboard?: 'default' | 'numeric' | 'decimal-pad';
}

/* -- The card. ------------------------------------------------------------------ */

export interface ItemCardProps {
    entityId?: string;
    /** The copy already in the order payload, so the card paints instantly. */
    seed?: EntityRecord | null;
    /** The order's waypoints, to name where the item is going. */
    stops?: OrderStop[];
    /** The server's answer for the order: may the driver change this field? */
    isEditable: (field: string) => boolean;
    /** The item's scan, by the id it is scanned under (see data/useItemScans). */
    scanOf: (subjectId?: string) => ItemScan | undefined;
    /** The server's list of scans has not answered yet. */
    scansLoading?: boolean;
    /** The server's list could not be read: only this phone's scans are known. */
    scansFailed?: boolean;
    /** The step that asks for a scan, when the order's next step does. */
    scanNeed?: string;
    /** Opens the scanner for this item. */
    onScan?: (item: { subjectId: string; name?: string; code?: string }) => void;
    /** Opens the photo full-screen. */
    onOpenPhoto?: (photo: { uri: string; name?: string }) => void;
    /** The fuller record has arrived (the payload's copy is sparse). */
    onResolved?: (entity: EntityRecord) => void;
    /** Opens the full edit form; only the item screen offers it. */
    onEdit?: (entity: { id: string; name?: string }) => void;
    openUrl: (url: string) => Promise<unknown>;
    /** The modal's card has a border and round corners; the item screen's fills the screen. */
    framed?: boolean;
    /** While the keyboard is up the footer makes room for the field. */
    hideFooter?: boolean;
    /** Room under the footer for the home indicator, when the card reaches the screen's foot. */
    bottomInset?: number;
}

export function ItemCard({
    entityId,
    seed,
    stops,
    isEditable,
    scanOf,
    scansLoading,
    scansFailed,
    scanNeed,
    onScan,
    onOpenPhoto,
    onResolved,
    onEdit,
    openUrl,
    framed = true,
    hideFooter,
    bottomInset = 0,
}: ItemCardProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const { isOnline } = useSync();
    const { adapter } = useFleetbase();

    const { entity: loaded, isLoading, isBlocked, error, retry } = useEntity(entityId, seed);
    const trackingRecordId = trackingRecordIdOf(loaded);
    const { events, failed: historyFailed, retry: retryHistory } = useScanHistory(trackingRecordId);

    /** What the driver changed here, shown at once: the request may still be in the queue. */
    const [saved, setSaved] = useState<Record<string, string>>({});
    const [damagedOverride, setDamagedOverride] = useState<boolean | undefined>(undefined);
    const [editing, setEditing] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    /** Where a change was saved on the phone rather than sent, so the note about it sits by the change. */
    const [queuedIn, setQueuedIn] = useState<'status' | 'note' | 'details' | null>(null);
    const [damageBusy, setDamageBusy] = useState(false);
    const [damageError, setDamageError] = useState<string | null>(null);

    // The host counts scans across the order, and needs each item's full record for that.
    const resolved = useRef(onResolved);
    resolved.current = onResolved;
    useEffect(() => {
        if (loaded) resolved.current?.(loaded);
    }, [loaded]);

    const entity = loaded;
    const trackingNumber = recordOf(entity?.tracking_number);
    const barcode = pngSource(trackingNumber?.barcode);
    const qr = pngSource(trackingNumber?.qr_code);
    const hasCodes = Boolean(barcode || qr);

    const rows = useMemo<DetailRow[]>(() => {
        if (!entity) return [];
        const currency = str(entity.currency);
        const quantity = entityQuantityOf(entity);
        const tracking = entityTrackingNumberOf(entity);
        const internalId = str(entity.internal_id);
        const candidates: DetailRow[] = [
            // The name is the card's title; it is a row only so it can be changed.
            { id: 'name', field: 'name', label: t('editPayloadItem.fieldName'), raw: saved.name ?? str(entity.name) ?? '' },
            {
                id: 'quantity',
                field: 'quantity',
                label: t('editPayloadItem.fieldQuantity'),
                value: saved.quantity ?? (quantity != null ? String(quantity) : undefined),
                raw: saved.quantity ?? str(entity.quantity) ?? '',
                keyboard: 'numeric',
            },
            {
                id: 'weight',
                field: 'weight',
                label: t('itemDetail.weight'),
                value: known(formatWeight((saved.weight ?? entity.weight) as string | number | null | undefined, str(entity.weight_unit))),
                raw: saved.weight ?? str(entity.weight) ?? '',
                keyboard: 'decimal-pad',
            },
            {
                id: 'dimensions',
                field: 'dimensions',
                label: t('itemDetail.size'),
                value: saved.dimensions ?? formatDimensions(entity.length as string, entity.width as string, entity.height as string, entity.dimensions_unit as string),
                raw: saved.dimensions ?? str(entity.dimensions) ?? '',
            },
            { id: 'price', label: t('itemDetail.price'), value: known(formatMoney(entity.price as string | number | null | undefined, currency)) },
            {
                id: 'declaredValue',
                field: 'declared_value',
                label: t('itemDetail.declaredValue'),
                value: known(formatMoney((saved.declared_value ?? entity.declared_value) as string | number | null | undefined, currency)),
                raw: saved.declared_value ?? str(entity.declared_value) ?? '',
                keyboard: 'decimal-pad',
            },
            { id: 'sku', field: 'sku', label: t('itemDetail.sku'), value: saved.sku ?? str(entity.sku), raw: saved.sku ?? str(entity.sku) ?? '', mono: true },
            {
                id: 'serialNumber',
                field: 'serial_number',
                label: t('editPayloadItem.fieldSerialNumber'),
                value: saved.serial_number ?? str(entity.serial_number),
                raw: saved.serial_number ?? str(entity.serial_number) ?? '',
                mono: true,
            },
            // Under the title already when it is the item's only id.
            { id: 'internalId', label: t('itemDetail.internalId'), value: internalId && internalId !== entityIdOf(entity) ? internalId : undefined, mono: true },
            // Printed under the barcode when there is one.
            { id: 'trackingNumber', label: t('itemDetail.trackingNumberLabel'), value: !hasCodes && tracking !== str(entity.sku) ? tracking : undefined, mono: true },
            { id: 'type', label: t('itemDetail.type'), value: str(entity.type) ? plainWords(str(entity.type) as string) : undefined },
            { id: 'customer', label: t('itemDetail.customer'), value: str(recordOf(entity.customer)?.name) },
            { id: 'trackingStatus', label: t('itemDetail.trackingStatus'), value: str(trackingNumber?.status) },
        ];
        return candidates.filter((row) => !!row.value || (!!row.field && isEditable(row.field)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entity, saved, hasCodes, isEditable, t]);

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" borderRadius={framed ? 22 : 0} borderWidth={framed ? 1 : 0} borderColor="$border" padding={14} gap={12} testID="item-detail-loading">
                <Skeleton height={72} />
                <Skeleton height={160} />
                <Skeleton height={200} />
            </YStack>
        );
    }

    if (isBlocked || !entity) {
        return (
            <YStack flex={1} backgroundColor="$background" borderRadius={framed ? 22 : 0} borderWidth={framed ? 1 : 0} borderColor="$border" padding={14} justifyContent="center" testID="item-detail-error">
                <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="item-detail-error" />
            </YStack>
        );
    }

    const id = entityIdOf(entity);
    const name = str(saved.name) ?? entityNameOf(entity);
    const tracking = entityTrackingNumberOf(entity);
    const damaged = damagedOverride ?? entityDamagedOf(entity);
    const photo = str(entity.photo_url);
    const goingTo = goingToOf(entity, stops);
    const storeNote = entityNoteOf(entity);
    const description = str(saved.description ?? entity.description);
    const noteEditable = isEditable('description');
    const files = (Array.isArray(entity.files) ? (entity.files as ItemFile[]) : []).filter(Boolean);
    const meta = Object.entries(recordOf(entity.meta) ?? {})
        .filter(([key]) => !META_SHOWN_ELSEWHERE.has(key))
        .map(([key, value]) => [key, metaText(value)] as const)
        .filter((entry): entry is readonly [string, string] => !!entry[1]);
    const anyEditable = rows.some((row) => !!row.field && isEditable(row.field));

    const brandInk = theme.primary?.val as string;
    const secondaryInk = theme.textSecondary?.val as string;
    const warningInk = theme.warningText?.val as string;
    const successInk = theme.successText?.val as string;
    const dangerInk = theme.dangerText?.val as string;
    const paper = '#FFFFFF';
    const ink = '#0A0F17';

    /* -- Scan state: what the server's proofs and this phone's record say. -- */
    const subjectId = entityScanIdOf(entity);
    const scan = scanOf(subjectId);
    const scanTime = scan ? scanStamp(scan.at) : '';
    const checking = !scan && !!scansLoading;
    const notScannedNote = scansFailed ? t('itemDetail.scanUnchecked') : scanNeed ? t('itemDetail.scanNeeded', { step: scanNeed }) : undefined;
    const startScan = subjectId && onScan ? () => onScan({ subjectId, name, code: tracking }) : undefined;

    /* -- Editing in place. -- */
    const startEdit = (field: string, raw: string) => {
        setEditing(field);
        setDraft(raw);
        setSaveError(null);
    };
    const cancelEdit = () => {
        setEditing(null);
        setSaveError(null);
    };
    const saveEdit = async (section: 'note' | 'details', initial: string) => {
        const field = editing;
        if (!field) return;
        // Nothing changed: nothing to send.
        if (draft === initial) {
            cancelEdit();
            return;
        }
        if (!id) {
            setSaveError(t('editPayloadItem.missingIdentifier'));
            return;
        }
        // Only what the server said may change is ever sent.
        if (!isEditable(field)) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            const result = await adapter.put(`entities/${id}`, { [field]: draft });
            setSaved((previous) => ({ ...previous, [field]: draft }));
            setEditing(null);
            if (isQueuedAck(result)) {
                setQueuedIn(section);
            } else {
                setQueuedIn((previous) => (previous === section ? null : previous));
                void retry();
            }
        } catch (err) {
            setSaveError((err as Error).message);
        } finally {
            setIsSaving(false);
        }
    };

    const toggleDamaged = async () => {
        if (damageBusy) return;
        if (!id) {
            setDamageError(t('editPayloadItem.missingIdentifier'));
            return;
        }
        const next = !damaged;
        setDamagedOverride(next);
        setDamageBusy(true);
        setDamageError(null);
        try {
            const result = await adapter.put(`entities/${id}`, { damaged: next });
            if (isQueuedAck(result)) setQueuedIn('status');
            else setQueuedIn((previous) => (previous === 'status' ? null : previous));
        } catch (err) {
            // Not saved: the switch goes back to what the record says.
            setDamagedOverride(!next);
            setDamageError((err as Error).message);
        } finally {
            setDamageBusy(false);
        }
    };

    const queuedNote = (section: 'status' | 'note' | 'details') => (queuedIn === section ? <Banner tone="neutral" message={t('editPayloadItem.saveQueued')} testID="save-queued" /> : null);

    const roleLabel = goingTo?.kind === 'pickup' || goingTo?.kind === 'dropoff' ? t(`itemDetail.goingToRole.${goingTo.kind}`) : goingTo?.kind === 'waypoint' ? t('itemDetail.goingToRole.waypoint', { number: goingTo.number ?? '' }).trim() : undefined;

    const footer =
        startScan && !hideFooter ? (
            <YStack gap={10} paddingTop={12} paddingHorizontal={14} paddingBottom={14 + bottomInset} borderTopWidth={1} borderColor="$border" backgroundColor="$surface" testID="item-footer">
                {scan ? (
                    <XStack alignItems="center" gap={12} minHeight={44} accessibilityRole="text" testID="item-scan-state">
                        <YStack width={44} height={44} borderRadius={22} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor="$successFill" borderWidth={1.5} borderColor="$successBorder">
                            <Glyph name="check" size={22} strokeWidth={3} color={successInk} />
                        </YStack>
                        <YStack flex={1} minWidth={0}>
                            <Body fontSize={18} lineHeight={24} fontWeight="800" tone="success" tabular>
                                {t('itemDetail.scannedAt', { time: scanTime })}
                            </Body>
                            {scan.queued ? (
                                <Secondary fontSize={13} lineHeight={17}>
                                    {t('proof.queued')}
                                </Secondary>
                            ) : null}
                        </YStack>
                    </XStack>
                ) : (
                    <XStack alignItems="center" gap={12} testID="item-scan-state">
                        <YStack
                            width={44}
                            height={44}
                            borderRadius={22}
                            flexShrink={0}
                            alignItems="center"
                            justifyContent="center"
                            backgroundColor={checking ? '$surfaceRaised' : '$warningFill'}
                            borderWidth={1.5}
                            borderColor={checking ? '$border' : '$warningBorder'}
                        >
                            <DashedRing size={22} color={checking ? secondaryInk : warningInk} />
                        </YStack>
                        <YStack flex={1} minWidth={0}>
                            <Body fontSize={19} lineHeight={24} fontWeight="800" tone={checking ? 'secondary' : 'warning'}>
                                {checking ? t('itemDetail.scanChecking') : t('itemDetail.notScanned')}
                            </Body>
                            {!checking && notScannedNote ? (
                                <Secondary fontSize={13} lineHeight={17}>
                                    {notScannedNote}
                                </Secondary>
                            ) : null}
                        </YStack>
                    </XStack>
                )}
                {scan ? (
                    <XStack height={60} gap={10} alignItems="center" justifyContent="center" borderRadius={16} borderWidth={1} borderColor="$border" onPress={startScan} pressStyle={{ opacity: 0.7 }} accessibilityRole="button" testID="item-scan-again">
                        <ItemIcon name="scan" size={18} color={secondaryInk} />
                        <Body fontSize={16} lineHeight={21} fontWeight="700" tone="secondary" numberOfLines={1}>
                            {t('itemDetail.scanAgain')}
                        </Body>
                    </XStack>
                ) : (
                    <Button fullWidth height={60} borderRadius={16} variant="primary" icon={<ItemIcon name="scan" size={20} color={theme.onPrimary?.val as string} />} onPress={startScan} testID="item-scan">
                        <Body tone="onPrimary" fontSize={18} lineHeight={24} fontWeight="800" numberOfLines={1}>
                            {t('itemDetail.scanNow')}
                        </Body>
                    </Button>
                )}
            </YStack>
        ) : null;

    return (
        <YStack flex={1} backgroundColor="$background" borderRadius={framed ? 22 : 0} borderWidth={framed ? 1 : 0} borderColor="$border" overflow="hidden" testID="item-detail">
            <YStack flex={1} minHeight={0}>
                <ScrollView
                    style={{ flex: 1 }}
                    bounces={false}
                    overScrollMode="never"
                    // Up and down only: sideways is the pager's.
                    directionalLockEnabled
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    // iOS moves the field being edited clear of the keyboard; Android resizes the window itself.
                    automaticallyAdjustKeyboardInsets
                    testID="item-scroll"
                >
                    {/* Edge to edge, clipped by the card's top corners, and gone once the driver scrolls. */}
                    {photo ? (
                        <YStack
                            height={160}
                            backgroundColor="$surfaceRaised"
                            onPress={onOpenPhoto ? () => onOpenPhoto({ uri: photo, name }) : undefined}
                            pressStyle={onOpenPhoto ? { opacity: 0.85 } : undefined}
                            accessibilityRole={onOpenPhoto ? 'button' : 'image'}
                            accessibilityLabel={t('itemDetail.photoOpen', { name: name ?? t('itemDetail.untitled') })}
                            testID="item-photo"
                        >
                            <Image source={{ uri: photo }} style={{ width: '100%', height: 160 }} resizeMode="cover" />
                        </YStack>
                    ) : null}

                    <YStack padding={14} gap={14}>
                        <YStack>
                            <Body fontSize={24} lineHeight={30} fontWeight="800" letterSpacing={-0.24} testID="item-name">
                                {name ?? t('itemDetail.untitled')}
                            </Body>
                            {/* Identifiers in full: a driver matches this against a label. */}
                            {id ? (
                                <Body fontFamily="$mono" fontSize={15} lineHeight={20} fontWeight="600" selectable testID="item-id">
                                    {id}
                                </Body>
                            ) : null}
                        </YStack>

                        {hasCodes ? (
                            <Sect label={t('itemDetail.codes')}>
                                {/* Codes are always dark on white, whatever the theme: that is what a scanner reads. */}
                                <Panel testID="item-barcode">
                                    <XStack alignItems="stretch" gap={10} padding={12}>
                                        {qr ? (
                                            <YStack padding={6} borderRadius={10} flexShrink={0} backgroundColor={paper}>
                                                <Image source={qr} style={{ width: 84, height: 84 }} resizeMode="contain" accessibilityLabel={t('itemDetail.qrAlt')} testID="item-qr" />
                                            </YStack>
                                        ) : null}
                                        {barcode || tracking ? (
                                            <YStack flex={1} minWidth={0} alignItems="center" justifyContent="center" gap={6} padding={8} borderRadius={10} backgroundColor={paper}>
                                                {barcode ? <Image source={barcode} style={{ width: '100%', height: 52 }} resizeMode="contain" accessibilityLabel={t('itemDetail.barcodeAlt')} /> : null}
                                                {tracking ? (
                                                    <Body fontFamily="$mono" fontSize={12} lineHeight={16} fontWeight="600" letterSpacing={0.7} color={ink} center selectable>
                                                        {tracking}
                                                    </Body>
                                                ) : null}
                                            </YStack>
                                        ) : null}
                                    </XStack>
                                </Panel>
                            </Sect>
                        ) : null}

                        <Sect label={t('itemDetail.status')}>
                            <Panel paddingHorizontal={14}>
                                {/* Said only where a scan can be made and read back: on an order, for an item with an id of its own. */}
                                {startScan ? (
                                    <>
                                        <XStack alignItems="center" gap={12} minHeight={68} paddingVertical={8} testID="item-status-scan">
                                            <YStack
                                                width={36}
                                                height={36}
                                                borderRadius={12}
                                                flexShrink={0}
                                                alignItems="center"
                                                justifyContent="center"
                                                borderWidth={1}
                                                backgroundColor={scan ? '$successFill' : checking ? '$surfaceRaised' : '$warningFill'}
                                                borderColor={scan ? '$successBorder' : checking ? '$border' : '$warningBorder'}
                                            >
                                                {scan ? <Glyph name="check" size={18} strokeWidth={3} color={successInk} /> : <DashedRing size={18} color={checking ? secondaryInk : warningInk} />}
                                            </YStack>
                                            <YStack flex={1} minWidth={0}>
                                                <Body fontSize={16} lineHeight={21} fontWeight="800" tone={scan ? 'success' : checking ? 'secondary' : 'warning'}>
                                                    {scan ? t('itemDetail.scanned') : checking ? t('itemDetail.scanChecking') : t('itemDetail.notScanned')}
                                                </Body>
                                                {scan ? (
                                                    <Secondary fontSize={13} lineHeight={17} tabular>
                                                        {scan.queued ? `${scanTime} · ${t('itemDetail.scanWaiting')}` : scanTime}
                                                    </Secondary>
                                                ) : !checking && notScannedNote ? (
                                                    <Secondary fontSize={13} lineHeight={17}>
                                                        {notScannedNote}
                                                    </Secondary>
                                                ) : null}
                                            </YStack>
                                        </XStack>
                                        <Rule />
                                    </>
                                ) : null}
                                {/* The damaged control: the whole row is the switch. */}
                                <XStack
                                    alignItems="center"
                                    gap={12}
                                    minHeight={64}
                                    paddingVertical={8}
                                    opacity={damageBusy ? 0.6 : 1}
                                    onPress={() => void toggleDamaged()}
                                    pressStyle={{ opacity: 0.7 }}
                                    accessibilityRole="switch"
                                    accessibilityState={{ checked: damaged, busy: damageBusy }}
                                    accessibilityLabel={t('itemDetail.damagedPill')}
                                    testID="flag-damaged"
                                >
                                    <YStack width={36} height={36} borderRadius={12} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor={damaged ? '$dangerFill' : '$surfaceRaised'} testID={damaged ? 'item-damaged' : undefined}>
                                        <HomeIcon name="issue" color={damaged ? dangerInk : secondaryInk} size={18} />
                                    </YStack>
                                    <YStack flex={1} minWidth={0}>
                                        <Body fontSize={16} lineHeight={21} fontWeight="800">
                                            {t('itemDetail.damagedPill')}
                                        </Body>
                                        <Secondary fontSize={13} lineHeight={17}>
                                            {damaged ? t('itemDetail.damagedFlagged') : t('itemDetail.damagedTurnOn')}
                                        </Secondary>
                                    </YStack>
                                    {/* Never colour alone: the word says it too. */}
                                    <Body fontSize={14} lineHeight={19} fontWeight="800" tone={damaged ? 'danger' : 'secondary'} testID={damaged ? 'damaged-pill' : undefined}>
                                        {damaged ? t('itemDetail.yes') : t('itemDetail.no')}
                                    </Body>
                                    <XStack
                                        width={56}
                                        height={34}
                                        borderRadius={17}
                                        flexShrink={0}
                                        alignItems="center"
                                        justifyContent={damaged ? 'flex-end' : 'flex-start'}
                                        paddingHorizontal={3}
                                        borderWidth={1.5}
                                        backgroundColor={damaged ? '$danger' : '$surfaceRaised'}
                                        borderColor={damaged ? '$danger' : '$border'}
                                    >
                                        <YStack width={25} height={25} borderRadius={13} backgroundColor={damaged ? '$white' : '$textSecondary'} />
                                    </XStack>
                                </XStack>
                                {damageError ? (
                                    <YStack paddingBottom={12} gap={2} testID="damaged-error">
                                        <Body fontSize={14} lineHeight={19} fontWeight="700" tone="danger">
                                            {t('editPayloadItem.saveFailed')}
                                        </Body>
                                        <Secondary fontSize={13} lineHeight={17}>
                                            {damageError}
                                        </Secondary>
                                    </YStack>
                                ) : null}
                            </Panel>
                            {queuedNote('status')}
                        </Sect>

                        {goingTo && (goingTo.title || roleLabel) ? (
                            <Sect label={t('itemDetail.goingTo')}>
                                <Panel testID="item-going-to">
                                    <XStack alignItems="center" gap={12} paddingVertical={6} paddingHorizontal={14}>
                                        {/* The console's marker, as the order's trip draws it. */}
                                        {goingTo.kind ? <StopBadge kind={goingTo.kind} number={goingTo.number} state="pending" /> : null}
                                        <YStack flex={1} minWidth={0} paddingVertical={goingTo.kind ? 0 : 6}>
                                            <Body fontSize={16} lineHeight={21} fontWeight="800" tabular>
                                                {goingTo.title ?? roleLabel}
                                            </Body>
                                            {goingTo.address ? (
                                                <Secondary fontSize={13} lineHeight={17}>
                                                    {goingTo.address}
                                                </Secondary>
                                            ) : null}
                                            {goingTo.title && roleLabel ? (
                                                <Secondary fontSize={13} lineHeight={17}>
                                                    {roleLabel}
                                                </Secondary>
                                            ) : null}
                                        </YStack>
                                    </XStack>
                                </Panel>
                            </Sect>
                        ) : null}

                        {storeNote || description || noteEditable ? (
                            <Sect label={t('itemDetail.note')}>
                                {/* What the customer or the store said about the item: read only. */}
                                {storeNote ? (
                                    <Panel paddingVertical={12} paddingHorizontal={14} testID="item-store-note">
                                        <Body fontSize={16} lineHeight={22} fontWeight="500">
                                            {storeNote}
                                        </Body>
                                    </Panel>
                                ) : null}
                                {editing === 'description' ? (
                                    <Panel paddingHorizontal={14}>
                                        <EditBlock
                                            label={t('editPayloadItem.fieldNotes')}
                                            value={draft}
                                            onChangeText={setDraft}
                                            multiline
                                            placeholder={t('editPayloadItem.notesPlaceholder')}
                                            saving={isSaving}
                                            error={saveError}
                                            onSave={() => void saveEdit('note', description ?? '')}
                                            onCancel={cancelEdit}
                                            field="description"
                                            t={t}
                                        />
                                    </Panel>
                                ) : noteEditable ? (
                                    <XStack
                                        alignItems="flex-start"
                                        gap={12}
                                        minHeight={48}
                                        paddingVertical={12}
                                        paddingStart={14}
                                        paddingEnd={12}
                                        borderRadius={18}
                                        backgroundColor="$surface"
                                        borderWidth={1.5}
                                        borderColor="$primaryBorder"
                                        onPress={() => startEdit('description', description ?? '')}
                                        pressStyle={{ opacity: 0.7 }}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('itemDetail.editNote')}
                                        testID="editable-description"
                                    >
                                        <Body flex={1} minWidth={0} fontSize={16} lineHeight={22} fontWeight="500" tone={description ? 'primary' : 'muted'}>
                                            {description ?? t('editPayloadItem.notesPlaceholder')}
                                        </Body>
                                        <YStack marginTop={2} flexShrink={0}>
                                            <ItemIcon name="pencil" size={18} color={brandInk} strokeWidth={2.2} />
                                        </YStack>
                                    </XStack>
                                ) : description ? (
                                    <Panel paddingVertical={12} paddingHorizontal={14} testID="item-description">
                                        <Body fontSize={16} lineHeight={22} fontWeight="500">
                                            {description}
                                        </Body>
                                    </Panel>
                                ) : null}
                                {queuedNote('note')}
                            </Sect>
                        ) : null}

                        {rows.length ? (
                            <Sect
                                label={t('itemDetail.details')}
                                aside={
                                    anyEditable ? (
                                        <XStack alignItems="center" gap={5} testID="editable-summary">
                                            <ItemIcon name="pencil" size={13} color={brandInk} />
                                            <Body fontSize={13} lineHeight={16} fontWeight="700" tone="brand" numberOfLines={1}>
                                                {t('itemDetail.youCanEdit')}
                                            </Body>
                                        </XStack>
                                    ) : undefined
                                }
                            >
                                <Panel paddingHorizontal={14} testID="item-meta">
                                    {rows.map((row, index) => {
                                        const editable = !!row.field && isEditable(row.field);
                                        const field = row.field as string;
                                        return (
                                            <YStack key={row.id}>
                                                {index > 0 ? <Rule /> : null}
                                                {editable && editing === field ? (
                                                    <EditBlock
                                                        label={row.label}
                                                        value={draft}
                                                        onChangeText={setDraft}
                                                        keyboard={row.keyboard}
                                                        tabular={row.keyboard !== undefined && row.keyboard !== 'default'}
                                                        saving={isSaving}
                                                        error={saveError}
                                                        onSave={() => void saveEdit('details', row.raw ?? '')}
                                                        onCancel={cancelEdit}
                                                        field={field}
                                                        t={t}
                                                    />
                                                ) : editable ? (
                                                    // The whole row opens the field, so the target is the row's height, not the chip's.
                                                    <XStack
                                                        alignItems="center"
                                                        justifyContent="space-between"
                                                        gap={12}
                                                        minHeight={52}
                                                        paddingVertical={6}
                                                        onPress={() => startEdit(field, row.raw ?? '')}
                                                        pressStyle={{ opacity: 0.7 }}
                                                        accessibilityRole="button"
                                                        accessibilityLabel={t('itemDetail.editField', { field: row.label, value: row.value ?? '' })}
                                                        testID={`meta-${row.id}`}
                                                    >
                                                        <Secondary fontSize={15} lineHeight={20}>
                                                            {row.label}
                                                        </Secondary>
                                                        <XStack flexShrink={1} alignItems="center" gap={8} minHeight={40} paddingVertical={6} paddingStart={12} paddingEnd={10} borderRadius={12} backgroundColor="$surfaceRaised" borderWidth={1.5} borderColor="$primaryBorder" testID={`editable-${field}`}>
                                                            <Body flexShrink={1} fontSize={16} lineHeight={21} fontWeight="800" tabular fontFamily={row.mono ? '$mono' : '$body'} tone={row.value ? 'primary' : 'secondary'}>
                                                                {row.value || t('itemDetail.add')}
                                                            </Body>
                                                            <ItemIcon name="pencil" size={15} color={brandInk} strokeWidth={2.2} />
                                                        </XStack>
                                                    </XStack>
                                                ) : (
                                                    <XStack alignItems="center" justifyContent="space-between" gap={12} minHeight={44} paddingVertical={6} testID={`meta-${row.id}`}>
                                                        <Secondary fontSize={15} lineHeight={20}>
                                                            {row.label}
                                                        </Secondary>
                                                        <Body flexShrink={1} fontSize={15} lineHeight={20} fontWeight={row.mono ? '600' : '700'} tabular fontFamily={row.mono ? '$mono' : '$body'} textAlign="right" selectable={row.mono}>
                                                            {row.value}
                                                        </Body>
                                                    </XStack>
                                                )}
                                            </YStack>
                                        );
                                    })}
                                </Panel>
                                {queuedNote('details')}
                            </Sect>
                        ) : null}

                        {files.length ? (
                            <Sect label={t('itemDetail.files', { count: files.length })}>
                                <Panel paddingHorizontal={14} testID="item-files">
                                    {files.map((file, index) => {
                                        const fileName = str(file.original_filename) ?? str(file.caption) ?? t('orderDetail.details.fileUnnamed');
                                        const url = str(file.url);
                                        const kind = fileKind(file);
                                        return (
                                            <YStack key={file.id ?? index}>
                                                {index > 0 ? <Rule /> : null}
                                                <XStack
                                                    alignItems="center"
                                                    justifyContent="space-between"
                                                    gap={12}
                                                    minHeight={52}
                                                    onPress={url ? () => void openUrl(url).catch(() => undefined) : undefined}
                                                    pressStyle={url ? { opacity: 0.7 } : undefined}
                                                    accessibilityRole={url ? 'button' : undefined}
                                                    accessibilityLabel={t('orderDetail.details.fileOpen', { name: fileName })}
                                                    testID={`item-file-${file.id ?? index}`}
                                                >
                                                    <XStack flex={1} minWidth={0} alignItems="center" gap={10}>
                                                        <YStack minWidth={34} height={24} paddingHorizontal={4} borderRadius={7} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor={kind === 'PDF' ? '$dangerFill' : '$surfaceRaised'}>
                                                            <Body fontSize={10} lineHeight={14} fontWeight="800" letterSpacing={0.4}>
                                                                {kind}
                                                            </Body>
                                                        </YStack>
                                                        <Body flex={1} fontSize={15} lineHeight={20} fontWeight="700">
                                                            {fileName}
                                                        </Body>
                                                    </XStack>
                                                    {url ? <Glyph name="chevron" size={16} strokeWidth={2.4} color={secondaryInk} /> : null}
                                                </XStack>
                                            </YStack>
                                        );
                                    })}
                                </Panel>
                            </Sect>
                        ) : null}

                        {meta.length ? (
                            <Sect label={t('itemDetail.metadata')}>
                                <Panel paddingHorizontal={14} testID="item-metadata">
                                    {meta.map(([key, value], index) => (
                                        <YStack key={key}>
                                            {index > 0 ? <Rule /> : null}
                                            <XStack alignItems="center" justifyContent="space-between" gap={12} minHeight={36} paddingVertical={6} testID={`item-meta-${key}`}>
                                                <Body flexShrink={0} maxWidth="50%" fontFamily="$mono" fontSize={13} lineHeight={18} fontWeight="500" tone="secondary">
                                                    {key}
                                                </Body>
                                                <Body flex={1} minWidth={0} fontFamily="$mono" fontSize={13} lineHeight={18} fontWeight="600" textAlign="right" selectable>
                                                    {value}
                                                </Body>
                                            </XStack>
                                        </YStack>
                                    ))}
                                </Panel>
                            </Sect>
                        ) : null}

                        {/* What has happened to the item's tracking number, newest first. There only when something has. */}
                        {events && events.length ? (
                            <Sect label={t('itemDetail.trackingHistory')}>
                                <Panel paddingHorizontal={14} testID="scan-history">
                                    {events.map((event: ScanEvent, index) => (
                                        <YStack key={event.id ?? index}>
                                            {index > 0 ? <Rule /> : null}
                                            <XStack paddingVertical={12} gap={12} alignItems="flex-start" testID={`scan-${event.id ?? index}`}>
                                                <YStack flex={1} gap={2}>
                                                    <StatusPill status={event.code} label={event.status} size="sm" />
                                                    {event.details ? (
                                                        <Secondary fontSize={13} lineHeight={17}>
                                                            {event.details}
                                                        </Secondary>
                                                    ) : null}
                                                    {[event.city, event.province, event.country].filter(Boolean).length ? <Micro>{[event.city, event.province, event.country].filter(Boolean).join(', ')}</Micro> : null}
                                                </YStack>
                                                <Micro tabular>{scanStamp(event.created_at)}</Micro>
                                            </XStack>
                                        </YStack>
                                    ))}
                                </Panel>
                            </Sect>
                        ) : historyFailed ? (
                            <Sect label={t('itemDetail.trackingHistory')}>
                                <ErrorState title={t('itemDetail.historyUnavailable')} body={t('itemDetail.historyUnavailableBody')} onRetry={retryHistory} retryLabel={t('common.retry')} tone="calm" testID="history-error" />
                            </Sect>
                        ) : null}

                        {onEdit && id ? (
                            <Button fullWidth variant="secondary" onPress={() => onEdit({ id, name })} testID="item-edit">
                                {t('itemDetail.edit')}
                            </Button>
                        ) : null}
                    </YStack>
                </ScrollView>

                {/* More below: the content fades out into the footer. */}
                {footer ? (
                    <YStack position="absolute" left={0} right={0} bottom={0} height={12} pointerEvents="none">
                        <Svg width="100%" height={12}>
                            <Defs>
                                <LinearGradient id="itemFade" x1="0" y1="0" x2="0" y2="1">
                                    <Stop offset="0" stopColor={theme.background?.val as string} stopOpacity={0} />
                                    <Stop offset="1" stopColor={theme.background?.val as string} stopOpacity={1} />
                                </LinearGradient>
                            </Defs>
                            <Rect x="0" y="0" width="100%" height={12} fill="url(#itemFade)" />
                        </Svg>
                    </YStack>
                ) : null}
            </YStack>
            {footer}
        </YStack>
    );
}

export default ItemCard;
