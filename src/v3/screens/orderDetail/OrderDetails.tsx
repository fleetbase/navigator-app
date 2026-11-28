/**
 * The order's reference — design round 3 (OrderCombinedScroll.dc.html).
 *
 * Everything about the order that is reference rather than "what do I do
 * next": its identifiers and type, its dates, what it costs, the codes to be
 * scanned, the organisation's own custom fields and metadata; and, placed by
 * the screen among its other sections, who arranged it, its files and its
 * comments.
 *
 * Each piece is exported on its own and draws one card, there only when the
 * order has that data, so the screen decides the order they appear in. Where
 * each one comes from on the driver API:
 *
 *   - identifiers, dates, type, meta — the order itself (Order.php);
 *   - QR code and barcode — `tracking_number.qr_code` / `.barcode`, bare
 *     base64 PNGs (TrackingNumber.php); the order-level copies are console-only;
 *   - facilitator — `order.facilitator`, loaded by both the list and the
 *     detail read;
 *   - service rate — `order.purchase_rate`, with its lines read from the
 *     service quote (see data/useServiceQuote);
 *   - files — `order.files`;
 *   - comments — their own endpoint (see data/useOrderComments);
 *   - activity — the order's steps from its config, timed from
 *     `order.tracking_statuses` (refreshed by data/useOrderTimeline); the whole
 *     history opens in a sheet over the order.
 *
 * There is no clipboard module in the app, so "copy" is the system share
 * sheet, which offers Copy among its actions.
 */
import { useNavigatorSettings } from '../../data/useNavigatorSettings';
import { useEffect, useState } from 'react';
import { Image, Keyboard, Modal, Platform, ScrollView, Share, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Secondary } from '../../ui/Text';
import { Banner, Skeleton } from '../../ui/Banner';
import { Field } from '../../ui/Field';
import { SheetModal } from '../../ui/SheetModal';
import { formatClock, formatDateTime, formatMoney } from '../../format';
import { dayKey } from '../../data/orderStore';
import {
    purchaseRateOf,
    serviceQuoteIdOf,
    trackingNumberOf,
    useOrderComments,
    useOrderProofs,
    useOrderTimeline,
    useServiceQuote,
    type OrderComment,
    type OrderConfig,
    type OrderProof,
    type OrderRecord,
    type TrackingStatusEvent,
} from '../../data';
import { humanizeStatus } from '../../theme/status';
import { Card, Glyph, IconButton, Initials, Section, SectionLabel, SmallRail } from '../jobs/parts';
import { HomeIcon, type HomeIconName } from '../home/parts';
import { EventRows, SectionLink } from './OrderSections';

type T = (key: string, options?: Record<string, unknown>) => string;
type Rec = Record<string, unknown>;

function text(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function recordOf(value: unknown): Rec | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : undefined;
}

/** The API sends bare base64 with no `data:` prefix; an Image needs one. */
function pngSource(value: unknown): { uri: string } | undefined {
    const raw = text(value);
    if (!raw) return undefined;
    return { uri: raw.startsWith('data:') || raw.startsWith('http') ? raw : `data:image/png;base64,${raw}` };
}

/** The order's scannable codes, as images, and the number they stand for. */
export function orderCodesOf(order?: Partial<OrderRecord> | null): { qr?: { uri: string }; barcode?: { uri: string }; number?: string } {
    const tn = recordOf(order?.tracking_number);
    return { qr: pngSource(tn?.qr_code), barcode: pngSource(tn?.barcode), number: order ? trackingNumberOf(order as OrderRecord) : undefined };
}

/** Today shows the clock alone; any other day needs its date. */
function stamp(iso?: string | null): string {
    if (!iso) return '';
    return dayKey(iso) === dayKey() ? formatClock(iso) : formatDateTime(iso);
}

function Rule() {
    return <YStack height={1} backgroundColor="$border" />;
}

/**
 * A section with nothing in it yet: an icon and one plain line, and under them
 * the action that would put something there, when there is one. Said rather
 * than left blank, so the driver knows the order has none and not that the
 * screen failed to show them.
 */
function EmptyCard({ icon, text, action, testID }: { icon: HomeIconName; text: string; action?: { label: string; onPress: () => void; testID?: string }; testID?: string }) {
    const theme = useTheme();
    return (
        <Card testID={testID}>
            <YStack gap={12}>
                <XStack alignItems="center" gap={10}>
                    <YStack width={36} height={36} borderRadius={12} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor="$surfaceRaised">
                        <HomeIcon name={icon} color={theme.textSecondary?.val as string} size={18} />
                    </YStack>
                    <Secondary flex={1} fontSize={15} lineHeight={20}>
                        {text}
                    </Secondary>
                </XStack>
                {action ? (
                    <XStack
                        height={48}
                        gap={8}
                        alignItems="center"
                        justifyContent="center"
                        borderRadius={14}
                        backgroundColor="$surfaceRaised"
                        borderWidth={1}
                        borderColor="$border"
                        onPress={action.onPress}
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityRole="button"
                        testID={action.testID}
                    >
                        <Body fontSize={15} lineHeight={20} fontWeight="700" numberOfLines={1}>
                            {action.label}
                        </Body>
                    </XStack>
                ) : null}
            </YStack>
        </Card>
    );
}

/* -- Identifiers and type. ---------------------------------------------------- */

/** How this order is proved: the method it asks for, or that it asks for none. */
function proofMethodLabel(order: OrderRecord, t: T): string {
    const record = order as Rec;
    const method = (text(record.pod_method) ?? '').toLowerCase();
    if (!record.pod_required && !method) return t('orderDetail.details.proofNone');
    if (method.includes('sign')) return t('orderDetail.proof.method.signature');
    if (method.includes('photo')) return t('orderDetail.proof.method.photo');
    if (method.includes('scan') || method.includes('qr')) return t('orderDetail.proof.method.scan');
    return record.pod_required ? (method ? humanizeStatus(method) : t('orderDetail.details.proofRequired')) : t('orderDetail.details.proofNone');
}

/** The ids a driver may be asked for, each in full, and what type of order it is. Tap an id to copy or share it. */
export function Identifiers({ order, config, t }: { order: OrderRecord; config?: OrderConfig | null; t: T }) {
    const type = text((order as Rec).type);
    const typeName = config?.name ?? (type ? humanizeStatus(type) : undefined);
    // The config's key ("parcel-delivery"), when it says more than the name already does.
    const typeKey = text(config?.key) ?? (config?.name ? type : undefined);
    const typeKeyShown = typeKey && typeName && typeKey.toLowerCase() !== typeName.toLowerCase() ? typeKey : undefined;
    const rows = [
        { key: 'tracking', label: t('orderDetail.details.trackingNumber'), value: trackingNumberOf(order), id: true },
        { key: 'internal', label: t('orderDetail.details.internalId'), value: text(order.internal_id), id: true },
        { key: 'id', label: t('orderDetail.details.orderId'), value: text(order.id), id: true },
        { key: 'type', label: t('orderDetail.details.typeShort'), value: typeName, id: false },
        { key: 'pod', label: t('orderDetail.details.proofOfDelivery'), value: proofMethodLabel(order, t), id: false },
    ].filter((row): row is { key: string; label: string; value: string; id: boolean } => !!row.value);
    if (!rows.length) return null;
    return (
        <Card padded={false} testID="order-identifiers">
            {rows.map((row, index) => (
                <YStack key={row.key} paddingHorizontal={14}>
                    {index > 0 ? <Rule /> : null}
                    <XStack
                        alignItems="center"
                        justifyContent="space-between"
                        gap={12}
                        minHeight={36}
                        paddingVertical={6}
                        onPress={row.id ? () => void Share.share({ message: row.value }).catch(() => undefined) : undefined}
                        pressStyle={row.id ? { opacity: 0.7 } : undefined}
                        accessibilityRole={row.id ? 'button' : undefined}
                        accessibilityLabel={row.id ? t('orderDetail.details.copy', { what: `${row.label} ${row.value}` }) : undefined}
                        testID={row.id ? `order-id-${row.key}-copy` : row.key === 'type' ? 'order-type' : `order-${row.key}`}
                    >
                        <Secondary fontSize={14}>{row.label}</Secondary>
                        {row.id ? (
                            // In full, wrapping if it must: an identifier is never cut short.
                            <Body flexShrink={1} fontFamily="$mono" fontSize={14} fontWeight="600" textAlign="right" testID={`order-id-${row.key}`}>
                                {row.value}
                            </Body>
                        ) : (
                            <YStack flexShrink={1} alignItems="flex-end">
                                <Body fontSize={14} fontWeight="700" textAlign="right" testID={row.key === 'type' ? 'order-type-name' : undefined}>
                                    {row.value}
                                </Body>
                                {row.key === 'type' && typeKeyShown ? (
                                    <Body fontFamily="$mono" fontSize={12} lineHeight={16} fontWeight="500" tone="secondary" textAlign="right" testID="order-type-key">
                                        {typeKeyShown}
                                    </Body>
                                ) : null}
                            </YStack>
                        )}
                    </XStack>
                </YStack>
            ))}
        </Card>
    );
}

/* -- Codes. ------------------------------------------------------------------ */

/** The QR code beside the barcode. Tap for both on a white screen, edge to edge. */
export function Codes({ order, t }: { order: OrderRecord; t: T }) {
    const [fullScreen, setFullScreen] = useState(false);
    const { qr, barcode, number } = orderCodesOf(order);
    if (!qr && !barcode) return null;

    // Codes are always dark on white, whatever the theme: that is what a scanner reads.
    const paper = '#FFFFFF';
    const ink = '#0A0F17';
    const barcodeBlock = (height: number, grow?: boolean) =>
        barcode ? (
            <YStack flex={grow ? 1 : undefined} minWidth={0} alignItems="center" justifyContent="center" gap={6} padding={8} borderRadius={10} backgroundColor={paper}>
                <Image source={barcode} style={{ width: '100%', height }} resizeMode="contain" accessibilityLabel={t('orderDetail.details.barcodeAlt')} />
                {number ? (
                    <Body fontFamily="$mono" fontSize={12} lineHeight={16} fontWeight="600" letterSpacing={1} color={ink} center>
                        {number}
                    </Body>
                ) : null}
            </YStack>
        ) : null;

    return (
        <>
            <Card padded={false} onPress={() => setFullScreen(true)} accessibilityLabel={t('orderDetail.details.fullScreen')} testID="order-codes-fullscreen">
                <XStack alignItems="stretch" gap={12} padding={12} testID="order-codes">
                    {qr ? (
                        <YStack padding={8} borderRadius={10} flexShrink={0} backgroundColor={paper}>
                            <Image source={qr} style={{ width: 84, height: 84 }} resizeMode="contain" accessibilityLabel={t('orderDetail.details.qrAlt')} testID="order-qr" />
                        </YStack>
                    ) : null}
                    {barcodeBlock(52, true)}
                </XStack>
            </Card>

            {/* White from edge to edge, so the code scans in any light and at arm's length. */}
            <Modal visible={fullScreen} animationType="fade" onRequestClose={() => setFullScreen(false)}>
                <YStack flex={1} backgroundColor={paper} padding={24} gap={24} alignItems="stretch" justifyContent="center" onPress={() => setFullScreen(false)} testID="order-codes-modal">
                    {qr ? <Image source={qr} style={{ width: '100%', height: 300 }} resizeMode="contain" accessibilityLabel={t('orderDetail.details.qrAlt')} /> : null}
                    {barcodeBlock(96)}
                    <Body center fontSize={15} fontWeight="700" color={ink}>
                        {t('orderDetail.details.tapToClose')}
                    </Body>
                </YStack>
            </Modal>
        </>
    );
}

/* -- Dates. ------------------------------------------------------------------ */

/** Two to a row. "Started" is always there: before the order starts it says so. */
export function Dates({ order, t }: { order: OrderRecord; t: T }) {
    const cells = [
        { key: 'created', label: t('orderDetail.details.created'), value: text(order.created_at) },
        { key: 'scheduled', label: t('orderDetail.details.scheduled'), value: text(order.scheduled_at) },
        { key: 'dispatched', label: t('orderDetail.details.dispatched'), value: text(order.dispatched_at) },
        { key: 'started', label: t('orderDetail.details.started'), value: text(order.started_at), always: true },
    ].filter((cell) => !!cell.value || cell.always);
    // Only "not started yet" to say: that alone is not worth a card.
    if (!cells.some((cell) => !!cell.value)) return null;
    const rows: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2));
    return (
        <Card padded={false} testID="order-dates">
            <YStack paddingHorizontal={14} paddingVertical={2}>
                {rows.map((row, index) => (
                    <XStack key={row[0].key} gap={12} borderTopWidth={index ? 1 : 0} borderColor="$border">
                        {row.map((cell) => (
                            <YStack key={cell.key} flex={1} minWidth={0} paddingVertical={5}>
                                <Secondary fontSize={12} lineHeight={15}>
                                    {cell.label}
                                </Secondary>
                                <Body fontSize={14} lineHeight={19} fontWeight="700" tabular tone={cell.value ? 'primary' : 'secondary'} testID={`order-date-${cell.key}`}>
                                    {cell.value ? formatDateTime(cell.value) : t('orderDetail.details.notStarted')}
                                </Body>
                            </YStack>
                        ))}
                        {row.length === 1 ? <YStack flex={1} /> : null}
                    </XStack>
                ))}
            </YStack>
        </Card>
    );
}

/* -- Facilitator. ------------------------------------------------------------ */

export function hasFacilitator(order?: Partial<OrderRecord> | null): boolean {
    return !!text(recordOf((order as Rec | undefined)?.facilitator)?.name);
}

export function Facilitator({ order, t, openUrl }: { order: OrderRecord; t: T; openUrl: (url: string) => Promise<unknown> }) {
    const facilitator = recordOf((order as Rec).facilitator);
    const name = text(facilitator?.name);
    if (!facilitator || !name) return null;
    const phone = text(facilitator.phone);
    // `facilitator-vendor`, `facilitator-contact`, `facilitator-integrated-vendor` (Order.php setFacilitatorType).
    const kind = String(facilitator.facilitator_type ?? facilitator.type ?? '').replace(/^facilitator-/, '');
    const kindLabel = kind === 'vendor' || kind === 'integrated-vendor' ? t('orderDetail.details.facilitatorVendor') : kind === 'contact' ? t('orderDetail.details.facilitatorContact') : undefined;
    return (
        <Section label={t('orderDetail.details.facilitator')}>
            <Card testID="order-facilitator">
                <XStack alignItems="center" gap={10}>
                    <Initials name={name} size={40} square />
                    <YStack flex={1} minWidth={0}>
                        <Body fontSize={16} lineHeight={21} fontWeight="800">
                            {name}
                        </Body>
                        {kindLabel ? (
                            <Secondary fontSize={13} lineHeight={17}>
                                {kindLabel}
                            </Secondary>
                        ) : null}
                    </YStack>
                    {phone ? (
                        <IconButton
                            name="call"
                            label={t('orderDetail.contact.callWho', { name })}
                            onPress={() => void openUrl(`tel:${phone.replace(/\s+/g, '')}`).catch(() => undefined)}
                            testID="call-facilitator"
                        />
                    ) : null}
                </XStack>
            </Card>
        </Section>
    );
}

/* -- Service rate. ----------------------------------------------------------- */

/** The lines on the left, the total on the right. */
export function ServiceRate({ order, t }: { order: OrderRecord; t: T }) {
    // The organisation decides whether its drivers see what an order is charged at.
    const { showServiceRate } = useNavigatorSettings();
    const rate = showServiceRate ? purchaseRateOf(order as { purchase_rate?: unknown }) : undefined;
    const { items } = useServiceQuote(serviceQuoteIdOf(rate));
    if (!rate || rate.amount == null) return null;
    const currency = text(rate.currency) ?? undefined;
    return (
        <Card padded={false} testID="order-rate">
            <XStack alignItems="stretch" gap={14} paddingVertical={12} paddingHorizontal={14}>
                <YStack flex={1} minWidth={0} gap={4}>
                    <YStack paddingBottom={2}>
                        <SectionLabel>{t('orderDetail.details.rate')}</SectionLabel>
                    </YStack>
                    {rate.service_name ? (
                        <Secondary fontSize={13} lineHeight={18}>
                            {rate.service_name}
                        </Secondary>
                    ) : null}
                    {items.map((item, index) => (
                        <XStack key={item.id ?? index} alignItems="baseline" justifyContent="space-between" gap={12} testID={`order-rate-line-${index}`}>
                            <Secondary flex={1} fontSize={13} lineHeight={18}>
                                {text(item.details) ?? (item.code ? humanizeStatus(item.code) : t('orderDetail.details.rateLine'))}
                            </Secondary>
                            <Body fontSize={13} lineHeight={18} fontWeight="700" tabular numberOfLines={1}>
                                {formatMoney(item.amount, text(item.currency) ?? currency)}
                            </Body>
                        </XStack>
                    ))}
                </YStack>
                <YStack flexShrink={0} alignItems="flex-end" justifyContent="flex-end" paddingStart={14} borderLeftWidth={1} borderColor="$border">
                    <SectionLabel>{t('orderDetail.details.rateTotal')}</SectionLabel>
                    <Body fontSize={20} lineHeight={26} fontWeight="800" tabular numberOfLines={1} testID="order-rate-total">
                        {formatMoney(rate.amount, currency)}
                    </Body>
                </YStack>
            </XStack>
        </Card>
    );
}

/* -- Files. ------------------------------------------------------------------ */

interface OrderFile {
    id?: string;
    url?: string | null;
    original_filename?: string | null;
    content_type?: string | null;
    file_size?: number | null;
    caption?: string | null;
    created_at?: string | null;
}

function fileKind(file: OrderFile): string {
    const name = text(file.original_filename) ?? '';
    const ext = name.includes('.') ? name.split('.').pop() : undefined;
    const fromType = text(file.content_type)?.split('/').pop();
    return String(ext ?? fromType ?? 'file').slice(0, 4).toUpperCase();
}

export function orderFilesOf(order?: Partial<OrderRecord> | null): OrderFile[] {
    const files = (order as Rec | undefined)?.files;
    return (Array.isArray(files) ? (files as OrderFile[]) : []).filter(Boolean);
}

export function Files({ order, t, openUrl }: { order: OrderRecord; t: T; openUrl: (url: string) => Promise<unknown> }) {
    const theme = useTheme();
    const files = orderFilesOf(order);
    if (!files.length) {
        return (
            <Section label={t('orderDetail.details.documentsHeading')}>
                <EmptyCard icon="note" text={t('orderDetail.details.documentsNone')} testID="order-files-empty" />
            </Section>
        );
    }
    return (
        <Section label={t('orderDetail.details.documents', { count: files.length })}>
            <Card padded={false} testID="order-files">
                {files.map((file, index) => {
                    const name = text(file.original_filename) ?? text(file.caption) ?? t('orderDetail.details.fileUnnamed');
                    const url = text(file.url);
                    const kind = fileKind(file);
                    return (
                        <YStack key={file.id ?? index} paddingHorizontal={14}>
                            {index > 0 ? <Rule /> : null}
                            <XStack
                                alignItems="center"
                                justifyContent="space-between"
                                gap={12}
                                minHeight={48}
                                onPress={url ? () => void openUrl(url).catch(() => undefined) : undefined}
                                pressStyle={url ? { opacity: 0.7 } : undefined}
                                accessibilityRole={url ? 'button' : undefined}
                                accessibilityLabel={t('orderDetail.details.fileOpen', { name })}
                                testID={`order-file-${file.id ?? index}`}
                            >
                                <XStack flex={1} minWidth={0} alignItems="center" gap={10}>
                                    <YStack minWidth={34} height={24} paddingHorizontal={4} borderRadius={7} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor={kind === 'PDF' ? '$dangerFill' : '$surfaceRaised'}>
                                        <Body fontSize={10} lineHeight={14} fontWeight="800" letterSpacing={0.4}>
                                            {kind}
                                        </Body>
                                    </YStack>
                                    <Body flex={1} fontSize={15} fontWeight="700" numberOfLines={1}>
                                        {name}
                                    </Body>
                                </XStack>
                                {url ? <Glyph name="chevron" size={16} strokeWidth={2.4} color={theme.textSecondary?.val as string} /> : null}
                            </XStack>
                        </YStack>
                    );
                })}
            </Card>
        </Section>
    );
}

/* -- Proof captured. ---------------------------------------------------------- */

const CAPTURED_ICONS: Record<'signature' | 'photo' | 'scan', HomeIconName> = { signature: 'pen', photo: 'camera', scan: 'scan' };

function proofKind(proof: OrderProof): 'signature' | 'photo' | 'scan' {
    if (proof.type === 'signature' || proof.type === 'photo' || proof.type === 'scan') return proof.type;
    const remarks = (text(proof.remarks) ?? '').toLowerCase();
    if (remarks.includes('signature')) return 'signature';
    return text(proof.url) ? 'photo' : 'scan';
}

/**
 * What has been captured on this order so far: each signature and photo with
 * its picture, each scan with the code that was read. Absent until there is
 * something to show; tap a picture to open it.
 */
export function CapturedProofs({ orderId, reloadToken, t, openUrl }: { orderId: string; reloadToken: number; t: T; openUrl: (url: string) => Promise<unknown> }) {
    const theme = useTheme();
    const { proofs } = useOrderProofs(orderId, reloadToken);
    if (!proofs?.length) return null;
    return (
        <Section label={t('orderDetail.details.proofsCaptured', { count: proofs.length })}>
            <Card padded={false} testID="order-proofs-captured">
                {proofs.map((proof, index) => {
                    const kind = proofKind(proof);
                    const url = text(proof.url);
                    const code = kind === 'scan' ? text(proof.raw) : undefined;
                    const onItem = (text(proof.subject_type) ?? '').includes('entity') ? text(proof.subject_id) : undefined;
                    const when = stamp(proof.created_at);
                    return (
                        <YStack key={proof.id} paddingHorizontal={14}>
                            {index > 0 ? <Rule /> : null}
                            <XStack
                                alignItems="center"
                                gap={12}
                                paddingVertical={10}
                                onPress={url ? () => void openUrl(url).catch(() => undefined) : undefined}
                                pressStyle={url ? { opacity: 0.7 } : undefined}
                                accessibilityRole={url ? 'button' : undefined}
                                accessibilityLabel={t(`orderDetail.proof.method.${kind}`)}
                                testID={`order-proof-captured-${proof.id}`}
                            >
                                {url ? (
                                    // On white whatever the theme: a signature is dark ink with nothing behind it.
                                    <YStack width={64} height={48} borderRadius={10} flexShrink={0} overflow="hidden" backgroundColor="#FFFFFF" borderWidth={1} borderColor="$border">
                                        <Image source={{ uri: url }} resizeMode={kind === 'signature' ? 'contain' : 'cover'} style={{ width: '100%', height: '100%' }} />
                                    </YStack>
                                ) : (
                                    <YStack width={64} height={48} borderRadius={10} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor="$surfaceRaised">
                                        <HomeIcon name={CAPTURED_ICONS[kind]} color={theme.textPrimary?.val as string} size={20} />
                                    </YStack>
                                )}
                                <YStack flex={1} minWidth={0} gap={1}>
                                    <XStack alignItems="center" gap={6}>
                                        <Body fontSize={16} lineHeight={21} fontWeight="800" numberOfLines={1}>
                                            {t(`orderDetail.proof.method.${kind}`)}
                                        </Body>
                                        <HomeIcon name="tick" color={theme.successText?.val as string} size={13} />
                                    </XStack>
                                    {when ? (
                                        <Secondary fontSize={13} lineHeight={17} numberOfLines={1}>
                                            {when}
                                        </Secondary>
                                    ) : null}
                                    {code ?? onItem ? (
                                        // In full: it is matched against a label.
                                        <Body fontFamily="$mono" fontSize={12} lineHeight={16} fontWeight="500" tone="secondary">
                                            {code ?? onItem}
                                        </Body>
                                    ) : null}
                                </YStack>
                                {url ? <Glyph name="chevron" size={16} strokeWidth={2.4} color={theme.textSecondary?.val as string} /> : null}
                            </XStack>
                        </YStack>
                    );
                })}
            </Card>
        </Section>
    );
}

/* -- Comments. --------------------------------------------------------------- */

function CommentRow({ comment, t, reply }: { comment: OrderComment; t: T; reply?: boolean }) {
    const name = text(comment.author?.name) ?? (comment.editable ? t('orderDetail.details.commentYou') : t('orderDetail.details.commentUnknown'));
    return (
        <YStack gap={10} testID={`order-comment-${comment.id}`}>
            <XStack alignItems="flex-start" gap={10} paddingStart={reply ? 42 : 0}>
                <Initials name={name} size={reply ? 26 : 32} />
                <YStack flex={1} minWidth={0} gap={2}>
                    <XStack alignItems="baseline" justifyContent="space-between" gap={8}>
                        <Body flex={1} fontSize={14} lineHeight={18} fontWeight="800" numberOfLines={1}>
                            {name}
                        </Body>
                        <Secondary fontSize={12} tabular numberOfLines={1}>
                            {comment.pending ? t('orderDetail.details.commentPending') : stamp(comment.created_at)}
                        </Secondary>
                    </XStack>
                    <Body fontSize={14} lineHeight={20}>
                        {comment.content ?? ''}
                    </Body>
                </YStack>
            </XStack>
            {(comment.replies ?? []).map((child) => (
                <CommentRow key={child.id} comment={child} t={t} reply />
            ))}
        </YStack>
    );
}

/** How much of the screen the keyboard covers, on iOS. Android resizes the window itself. */
function useKeyboardInset(): number {
    const [height, setHeight] = useState(0);
    useEffect(() => {
        if (Platform.OS !== 'ios') return undefined;
        const show = Keyboard.addListener('keyboardWillShow', (event) => setHeight(event.endCoordinates?.height ?? 0));
        const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
        return () => {
            show.remove();
            hide.remove();
        };
    }, []);
    return height;
}

/**
 * Read and write. Unlike the other sections this one is always there once it
 * has loaded, because an empty thread is still somewhere to leave a note. The
 * comments are a card each; writing one opens a small sheet with the field, so
 * the keyboard never has to share the screen with the order's own sheet.
 */
export function Comments({ orderId, reloadToken, t }: { orderId: string; reloadToken: number; t: T }) {
    const { comments, isLoading, failed, post, isPosting, postError } = useOrderComments(orderId, reloadToken);
    const insets = useSafeAreaInsets();
    const keyboard = useKeyboardInset();
    const [draft, setDraft] = useState('');
    const [queued, setQueued] = useState(false);
    const [writing, setWriting] = useState(false);

    const send = async () => {
        const outcome = await post(draft);
        if (outcome === 'failed') return;
        setDraft('');
        setQueued(outcome === 'queued');
        setWriting(false);
    };

    // Could not be read and nothing to show: leave the section out rather than draw an error box.
    if (failed && !comments) return null;
    const count = comments?.length ?? 0;

    return (
        <Section
            label={count ? t('orderDetail.details.commentsCount', { count }) : t('orderDetail.details.comments')}
            aside={<SectionLink label={t('orderDetail.details.commentAdd')} onPress={() => setWriting(true)} testID="order-comment-add" />}
        >
            <YStack gap={8} testID="order-comments">
                {isLoading && !comments ? <Skeleton height={48} /> : null}
                {comments && !count && !queued ? (
                    <EmptyCard
                        icon="chat"
                        text={t('orderDetail.details.commentsNone')}
                        action={{ label: t('orderDetail.details.commentAdd'), onPress: () => setWriting(true), testID: 'order-comment-add-empty' }}
                        testID="order-comments-empty"
                    />
                ) : null}
                {(comments ?? []).map((comment) => (
                    <Card key={comment.id} padded={false}>
                        <YStack paddingVertical={12} paddingHorizontal={14}>
                            <CommentRow comment={comment} t={t} />
                        </YStack>
                    </Card>
                ))}
                {queued ? <Banner tone="neutral" message={t('orderDetail.details.commentQueued')} testID="order-comment-queued" /> : null}
            </YStack>

            <SheetModal visible={writing} onClose={() => setWriting(false)} testID="order-comment-sheet">
                <YStack padding={16} paddingBottom={Math.max(insets.bottom, 16) + keyboard} gap={12} backgroundColor="$background" borderTopLeftRadius={26} borderTopRightRadius={26} borderWidth={1} borderColor="$border">
                    <SectionLabel>{t('orderDetail.details.commentAdd')}</SectionLabel>
                    {postError ? <Banner tone="danger" message={t('orderDetail.details.commentFailed')} meta={postError} testID="order-comment-error" /> : null}
                    <Field
                        value={draft}
                        onChangeText={setDraft}
                        placeholder={t('orderDetail.details.commentPlaceholder')}
                        autoCapitalize="sentences"
                        accessory={
                            <IconButton
                                name="send"
                                size={40}
                                round
                                filled
                                disabled={!draft.trim() || isPosting}
                                label={t('orderDetail.details.commentPost')}
                                onPress={() => void send()}
                                testID="order-comment-post"
                            />
                        }
                        testID="order-comment-input"
                    />
                </YStack>
            </SheetModal>
        </Section>
    );
}

/* -- Metadata. --------------------------------------------------------------- */

function metaSummary(value: unknown, t: T): { text: string; nested: boolean } {
    if (Array.isArray(value)) return { text: t('orderDetail.details.metaItems', { count: value.length }), nested: value.length > 0 };
    if (value && typeof value === 'object') {
        const count = Object.keys(value as Rec).length;
        return { text: t('orderDetail.details.metaFields', { count }), nested: count > 0 };
    }
    if (value === null || value === undefined || value === '') return { text: '—', nested: false };
    return { text: String(value), nested: false };
}

function MetaRow({ name, value, depth, t }: { name: string; value: unknown; depth: number; t: T }) {
    const [open, setOpen] = useState(false);
    const summary = metaSummary(value, t);
    const children = summary.nested ? (Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as Rec)) : [];
    return (
        <YStack>
            <XStack
                alignItems="center"
                gap={12}
                minHeight={30}
                paddingVertical={5}
                paddingEnd={14}
                paddingStart={14 + depth * 14}
                onPress={summary.nested ? () => setOpen((v) => !v) : undefined}
                pressStyle={summary.nested ? { opacity: 0.7 } : undefined}
                accessibilityRole={summary.nested ? 'button' : undefined}
                accessibilityState={summary.nested ? { expanded: open } : undefined}
                testID={`order-meta-${name}`}
            >
                <Body flexShrink={1} fontFamily="$mono" fontSize={13} fontWeight="500" tone="secondary">
                    {name}
                </Body>
                <Body flex={1} minWidth={0} fontFamily="$mono" fontSize={13} fontWeight="600" textAlign="right" tone={summary.nested ? 'brand' : 'primary'} selectable={!summary.nested}>
                    {summary.text}
                </Body>
                {summary.nested ? <Glyph name={open ? 'chevronDown' : 'chevron'} size={14} strokeWidth={2.4} /> : null}
            </XStack>
            {/* Three levels is as deep as a phone can show; deeper values are summarised, not hidden. */}
            {open
                ? children.map(([key, child]) =>
                      depth < 2 ? (
                          <MetaRow key={key} name={key} value={child} depth={depth + 1} t={t} />
                      ) : (
                          <MetaRow key={key} name={key} value={typeof child === 'object' && child !== null ? JSON.stringify(child) : child} depth={depth + 1} t={t} />
                      )
                  )
                : null}
        </YStack>
    );
}

export function Metadata({ order, t }: { order: OrderRecord; t: T }) {
    const entries = Object.entries(recordOf(order.meta) ?? {});
    if (!entries.length) return null;
    return (
        <Card padded={false} testID="order-meta">
            {entries.map(([key, value], index) => (
                <YStack key={key}>
                    {index > 0 ? <Rule /> : null}
                    <MetaRow name={key} value={value} depth={0} t={t} />
                </YStack>
            ))}
        </Card>
    );
}

/**
 * The order type's own fields. On the driver API the order lists their keys in
 * `custom_fields` and carries each value beside its other attributes
 * (HasCustomFields::withCustomFields; a key that clashes is prefixed `_`).
 */
export function CustomFields({ order, t }: { order: OrderRecord; t: T }) {
    const keys = Array.isArray((order as Rec).custom_fields) ? ((order as Rec).custom_fields as unknown[]).filter((k): k is string => typeof k === 'string') : [];
    const entries = keys.map((key) => [key, (order as Rec)[key] ?? (order as Rec)[`_${key}`]] as const).filter(([, value]) => value !== null && value !== undefined && value !== '');
    if (!entries.length) return null;
    return (
        <Card padded={false} testID="order-custom-fields">
            {entries.map(([key, value], index) => (
                <YStack key={key}>
                    {index > 0 ? <Rule /> : null}
                    <MetaRow name={key} value={value} depth={0} t={t} />
                </YStack>
            ))}
        </Card>
    );
}

/* -- Timeline. --------------------------------------------------------------- */

/** The order's history, newest first. The order screen links to the timeline screen instead; this is for a surface that shows it in place. */
export function Timeline({ orderId, onOpenTimeline, t }: { orderId: string; onOpenTimeline?: () => void; t: T }) {
    const { events } = useOrderTimeline(orderId);
    if (!events?.length) return null;
    // The hook sorts oldest first for the timeline screen; here the latest leads.
    const newestFirst = [...events].reverse();
    return (
        <Section label={t('orderDetail.details.timeline')} aside={onOpenTimeline ? <SectionLink label={t('orderDetail.details.timelineOpen')} onPress={onOpenTimeline} testID="open-timeline-details" /> : undefined}>
            <Card testID="order-timeline-section">
                <EventRows events={newestFirst} t={t} dated />
            </Card>
        </Section>
    );
}

/* -- The reference block. ------------------------------------------------------ */

/** Ids and type, dates, the rate, the codes, custom fields and metadata, under one label. What has happened to the order is its own section (Activity). */
export function OrderReference({ order, config, t }: { order: OrderRecord; config?: OrderConfig | null; t: T }) {
    return (
        <Section label={t('orderDetail.details.reference')} testID="order-reference">
            <YStack gap={8}>
                <Identifiers order={order} config={config} t={t} />
                <Dates order={order} t={t} />
                <ServiceRate order={order} t={t} />
                <Codes order={order} t={t} />
                <CustomFields order={order} t={t} />
                <Metadata order={order} t={t} />
            </YStack>
        </Section>
    );
}

/* -- Activity. ----------------------------------------------------------------- */

/** The activity rows: the step's name starts this far down its row, on lines this high; the mark is placed to share the first line's middle. */
const ACTIVITY_TEXT_TOP = 4;
const ACTIVITY_LINE = 20;
const ACTIVITY_MARK = 22;
const ACTIVITY_MARK_TOP = ACTIVITY_TEXT_TOP + ACTIVITY_LINE / 2 - ACTIVITY_MARK / 2;

export interface ActivityStep {
    key: string;
    /** The step in the driver's words. */
    label: string;
    state: 'done' | 'current' | 'next';
    /** When it happened, for a step that has. */
    at?: string | null;
}

/**
 * The order's steps: the ones done, with when; the one it stands at, marked;
 * and the ones still to come. Each says its state in a word beside its mark,
 * never by the mark's colour alone. "See all activity" opens the whole history
 * in a sheet over the order.
 */
export function ActivitySection({ steps, onSeeAll, t }: { steps: ActivityStep[]; onSeeAll?: () => void; t: T }) {
    const theme = useTheme();
    return (
        <Section label={t('orderDetail.activity.heading')} testID="order-activity">
            <Card padded={false}>
                {steps.length ? (
                    <YStack paddingHorizontal={14} paddingVertical={6}>
                        {steps.map((step, index) => {
                            const last = index === steps.length - 1;
                            const done = step.state === 'done';
                            const current = step.state === 'current';
                            return (
                                <XStack key={step.key} alignItems="stretch" gap={12} testID={`order-activity-${step.key}`}>
                                    {/*
                                      * The rail: this step's mark, and the dotted line on to the next. The mark is
                                      * centred on the first line of the step's name on every row: both are placed
                                      * from the top of the row (the name's first line is 20 high under 4 of padding,
                                      * so its middle is at 14, and so is the middle of a 22 mark under 3), whatever
                                      * else the row carries. Centring the two against each other moved the name down
                                      * on a row that also shows a time, and left the mark above it.
                                      */}
                                    <YStack width={22} alignItems="center">
                                        <YStack
                                            width={22}
                                            height={22}
                                            borderRadius={11}
                                            marginTop={ACTIVITY_MARK_TOP}
                                            alignItems="center"
                                            justifyContent="center"
                                            backgroundColor={done ? '$successFill' : current ? '$primary' : 'transparent'}
                                            borderWidth={done ? 1 : current ? 0 : 1.5}
                                            borderColor={done ? '$successBorder' : '$border'}
                                        >
                                            {done ? (
                                                <HomeIcon name="tick" color={theme.successText?.val as string} size={12} />
                                            ) : current ? (
                                                <YStack width={8} height={8} borderRadius={4} backgroundColor="$onPrimary" />
                                            ) : null}
                                        </YStack>
                                        {/* Dots laid over the slot, so they take the row's height and never add to it (a dotted border on one side does not draw on iOS). */}
                                        {last ? null : <SmallRail minHeight={6} inset={3} dot={3} />}
                                    </YStack>
                                    <XStack flex={1} minWidth={0} alignItems="flex-start" justifyContent="space-between" gap={10} minHeight={36} paddingTop={ACTIVITY_TEXT_TOP} paddingBottom={8}>
                                        <Body flex={1} fontSize={15} lineHeight={ACTIVITY_LINE} fontWeight={current ? '800' : '700'} tone={done || current ? 'primary' : 'secondary'}>
                                            {step.label}
                                        </Body>
                                        {/* Its first line (16 high) sits on the same middle as the name's (20 high). */}
                                        <YStack flexShrink={0} alignItems="flex-end" marginTop={(ACTIVITY_LINE - 16) / 2}>
                                            <Secondary fontSize={12} lineHeight={16} fontWeight="800" tone={current ? 'brand' : done ? 'success' : 'secondary'} numberOfLines={1}>
                                                {t(current ? 'orderDetail.activity.current' : done ? 'orderDetail.activity.done' : 'orderDetail.activity.next')}
                                            </Secondary>
                                            {step.at ? (
                                                <Secondary fontSize={12} lineHeight={16} tabular numberOfLines={1} testID={`order-activity-${step.key}-at`}>
                                                    {stamp(step.at)}
                                                </Secondary>
                                            ) : null}
                                        </YStack>
                                    </XStack>
                                </XStack>
                            );
                        })}
                    </YStack>
                ) : (
                    <YStack paddingHorizontal={14} paddingVertical={12}>
                        <Secondary fontSize={15} lineHeight={20} testID="order-activity-none">
                            {t('orderDetail.activity.none')}
                        </Secondary>
                    </YStack>
                )}
                {onSeeAll ? (
                    <XStack
                        alignItems="center"
                        justifyContent="space-between"
                        gap={10}
                        minHeight={48}
                        paddingHorizontal={14}
                        borderTopWidth={1}
                        borderColor="$border"
                        onPress={onSeeAll}
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityRole="button"
                        testID="open-timeline"
                    >
                        <Body fontSize={15} lineHeight={20} fontWeight="700" tone="brand" numberOfLines={1}>
                            {t('orderDetail.activity.seeAll')}
                        </Body>
                        <Glyph name="chevron" size={16} strokeWidth={2.4} color={theme.textSecondary?.val as string} />
                    </XStack>
                ) : null}
            </Card>
        </Section>
    );
}

/**
 * Everything that has happened to the order, newest first, in a sheet over the
 * order screen: the driver reads it and closes it without leaving the order.
 * The rows are the timeline's own (`EventRows`), from the order's tracking
 * statuses; the screen reads them once (`useOrderTimeline`) and hands them to
 * this sheet and to the activity section alike.
 */
export function ActivitySheet({
    visible,
    onClose,
    events,
    isLoading,
    failed,
    number,
    t,
    bottomInset = 0,
}: {
    visible: boolean;
    onClose: () => void;
    /** The order's tracking statuses, oldest first. */
    events?: TrackingStatusEvent[];
    isLoading?: boolean;
    /** The last refresh failed: what is shown is what was last known. */
    failed?: boolean;
    number?: string;
    t: T;
    bottomInset?: number;
}) {
    const windowHeight = useWindowDimensions().height;
    // The hook sorts oldest first for the timeline screen; here the latest leads.
    const newestFirst = [...(events ?? [])].reverse();
    return (
        <SheetModal visible={visible} onClose={onClose} dismissLabel={t('common.close')} testID="order-activity-sheet">
            <YStack maxHeight={Math.round(windowHeight * 0.8)} padding={16} paddingBottom={Math.max(bottomInset, 16)} gap={12} backgroundColor="$background" borderTopLeftRadius={26} borderTopRightRadius={26} borderWidth={1} borderColor="$border">
                <YStack gap={2}>
                    <SectionLabel>{t('orderDetail.activity.heading')}</SectionLabel>
                    {number ? (
                        // In full: an identifier is never cut short.
                        <Body fontFamily="$mono" fontSize={16} lineHeight={21} fontWeight="600" selectable>
                            {number}
                        </Body>
                    ) : null}
                </YStack>
                {failed && newestFirst.length ? <Banner tone="warning" message={t('orderDetail.activity.refreshFailed')} testID="order-activity-stale" /> : null}
                {isLoading && !newestFirst.length ? (
                    <Skeleton height={120} />
                ) : newestFirst.length ? (
                    <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never" contentContainerStyle={{ paddingVertical: 4 }} testID="order-activity-list">
                        <EventRows events={newestFirst} t={t} dated />
                    </ScrollView>
                ) : (
                    <Secondary fontSize={15} lineHeight={20} testID="order-activity-sheet-none">
                        {t('orderDetail.activity.none')}
                    </Secondary>
                )}
                <YStack height={48} borderRadius={14} alignItems="center" justifyContent="center" backgroundColor="$surfaceRaised" borderWidth={1} borderColor="$border" onPress={onClose} pressStyle={{ opacity: 0.7 }} accessibilityRole="button" testID="order-activity-close">
                    <Body fontSize={15} fontWeight="700" numberOfLines={1}>
                        {t('common.close')}
                    </Body>
                </YStack>
            </YStack>
        </SheetModal>
    );
}
