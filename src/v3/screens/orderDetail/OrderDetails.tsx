/**
 * Order → Details — design round 3 (OrderDetails.dc.html).
 *
 * Everything about the order that is reference rather than "what do I do
 * next": its identifiers, the codes to be scanned, its dates, what type of
 * order it is, who arranged it, what it costs, its files, its comments, the
 * organisation's own custom fields and metadata, and the full history.
 *
 * Each section is there only when the order has that data. Where each one
 * comes from on the driver API:
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
 *   - timeline — `order.tracking_statuses`, refreshed by data/useOrderTimeline.
 *
 * There is no clipboard module in the app, so "copy" is the system share
 * sheet, which offers Copy among its actions.
 */
import { useNavigatorSettings } from '../../data/useNavigatorSettings';
import { useState } from 'react';
import { Image, Linking, Modal, Share } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Secondary } from '../../ui/Text';
import { Banner, Skeleton } from '../../ui/Banner';
import { Field } from '../../ui/Field';
import { useTranslation } from '../../i18n/useTranslation';
import { formatClock, formatDateTime, formatMoney } from '../../format';
import { dayKey } from '../../data/orderStore';
import {
    purchaseRateOf,
    serviceQuoteIdOf,
    trackingNumberOf,
    useOrderComments,
    useOrderTimeline,
    useServiceQuote,
    type OrderComment,
    type OrderConfig,
    type OrderRecord,
} from '../../data';
import { humanizeStatus } from '../../theme/status';
import { Card, Glyph, IconButton, Initials, Section } from '../jobs/parts';
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

/** Today shows the clock alone; any other day needs its date. */
function stamp(iso?: string | null): string {
    if (!iso) return '';
    return dayKey(iso) === dayKey() ? formatClock(iso) : formatDateTime(iso);
}

function formatBytes(bytes: unknown): string | undefined {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Rule() {
    return <YStack height={1} backgroundColor="$border" />;
}

/* -- Identifiers. ------------------------------------------------------------ */

function Identifiers({ order, t }: { order: OrderRecord; t: T }) {
    const rows = [
        { key: 'tracking', label: t('orderDetail.details.trackingNumber'), value: trackingNumberOf(order) },
        { key: 'id', label: t('orderDetail.details.orderId'), value: text(order.id) },
        { key: 'internal', label: t('orderDetail.details.internalId'), value: text(order.internal_id) },
    ].filter((row): row is { key: string; label: string; value: string } => !!row.value);
    if (!rows.length) return null;
    return (
        <Section label={t('orderDetail.details.identifiers')}>
            <Card padded={false} testID="order-identifiers">
                {rows.map((row, index) => (
                    <YStack key={row.key}>
                        {index > 0 ? <Rule /> : null}
                        <XStack alignItems="center" gap={12} paddingVertical={12} paddingHorizontal={14}>
                            <YStack flex={1} gap={2}>
                                <Secondary fontSize={13}>{row.label}</Secondary>
                                <Body fontFamily="$mono" fontSize={16} fontWeight="600" selectable testID={`order-id-${row.key}`}>
                                    {row.value}
                                </Body>
                            </YStack>
                            <IconButton
                                name="share"
                                size={44}
                                label={t('orderDetail.details.copy', { what: row.label })}
                                onPress={() => void Share.share({ message: row.value }).catch(() => undefined)}
                                testID={`order-id-${row.key}-copy`}
                            />
                        </XStack>
                    </YStack>
                ))}
            </Card>
        </Section>
    );
}

/* -- Codes. ------------------------------------------------------------------ */

function Codes({ order, t }: { order: OrderRecord; t: T }) {
    const [fullScreen, setFullScreen] = useState(false);
    const tn = recordOf(order.tracking_number);
    const qr = pngSource(tn?.qr_code);
    const barcode = pngSource(tn?.barcode);
    const number = trackingNumberOf(order);
    if (!qr && !barcode) return null;

    // Codes are always dark on white, whatever the theme: that is what a scanner reads.
    const paper = '#FFFFFF';
    const ink = '#0A0F17';
    const barcodeBlock = (height: number) =>
        barcode ? (
            <YStack alignItems="center" gap={6} padding={12} borderRadius={12} backgroundColor={paper}>
                <Image source={barcode} style={{ width: '100%', height }} resizeMode="contain" accessibilityLabel={t('orderDetail.details.barcodeAlt')} />
                {number ? (
                    <Body fontFamily="$mono" fontSize={13} fontWeight="600" letterSpacing={1.5} color={ink}>
                        {number}
                    </Body>
                ) : null}
            </YStack>
        ) : null;

    return (
        <Section label={t('orderDetail.details.codes')}>
            <Card testID="order-codes">
                <YStack gap={14}>
                    {qr ? (
                        <XStack alignItems="center" gap={14}>
                            <YStack padding={10} borderRadius={12} backgroundColor={paper}>
                                <Image source={qr} style={{ width: 105, height: 105 }} resizeMode="contain" accessibilityLabel={t('orderDetail.details.qrAlt')} testID="order-qr" />
                            </YStack>
                            <YStack flex={1} gap={6}>
                                <Body fontSize={16} fontWeight="800">
                                    {t('orderDetail.details.codesTitle')}
                                </Body>
                                <Secondary fontSize={14} lineHeight={20}>
                                    {t('orderDetail.details.codesBody')}
                                </Secondary>
                            </YStack>
                        </XStack>
                    ) : null}
                    {barcodeBlock(56)}
                    <YStack
                        height={48}
                        borderRadius={14}
                        borderWidth={1}
                        borderColor="$border"
                        backgroundColor="$surfaceRaised"
                        alignItems="center"
                        justifyContent="center"
                        onPress={() => setFullScreen(true)}
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityRole="button"
                        testID="order-codes-fullscreen"
                    >
                        <Body fontSize={15} fontWeight="700" numberOfLines={1}>
                            {t('orderDetail.details.fullScreen')}
                        </Body>
                    </YStack>
                </YStack>
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
        </Section>
    );
}

/* -- Dates. ------------------------------------------------------------------ */

function Dates({ order, t }: { order: OrderRecord; t: T }) {
    const rows = [
        { key: 'created', label: t('orderDetail.details.created'), value: order.created_at },
        { key: 'scheduled', label: t('orderDetail.details.scheduled'), value: order.scheduled_at },
        { key: 'dispatched', label: t('orderDetail.details.dispatched'), value: order.dispatched_at },
        { key: 'started', label: t('orderDetail.details.started'), value: order.started_at },
    ].filter((row): row is { key: string; label: string; value: string } => !!text(row.value));
    if (!rows.length) return null;
    return (
        <Section label={t('orderDetail.details.dates')}>
            <Card padded={false} testID="order-dates">
                {rows.map((row, index) => (
                    <YStack key={row.key}>
                        {index > 0 ? <Rule /> : null}
                        <XStack alignItems="center" justifyContent="space-between" gap={12} minHeight={52} paddingHorizontal={14}>
                            <Secondary fontSize={15}>{row.label}</Secondary>
                            <Body fontSize={15} fontWeight="700" tabular numberOfLines={1} testID={`order-date-${row.key}`}>
                                {formatDateTime(row.value)}
                            </Body>
                        </XStack>
                    </YStack>
                ))}
            </Card>
        </Section>
    );
}

/* -- Order type. ------------------------------------------------------------- */

function OrderType({ order, config, t }: { order: OrderRecord; config?: OrderConfig | null; t: T }) {
    const type = text((order as Rec).type);
    const name = config?.name ?? (type ? humanizeStatus(type) : undefined);
    if (!name) return null;
    const key = config?.key ?? type;
    const steps = config?.flow?.length ?? 0;
    return (
        <Section label={t('orderDetail.details.type')}>
            <Card testID="order-type">
                <XStack alignItems="center" gap={12}>
                    <YStack width={44} height={44} borderRadius={14} alignItems="center" justifyContent="center" backgroundColor="$primaryFill">
                        <Glyph name="list" />
                    </YStack>
                    <YStack flex={1} gap={2}>
                        <Body fontSize={16} fontWeight="800">
                            {name}
                        </Body>
                        {key && key !== name ? (
                            <Body fontFamily="$mono" fontSize={13} fontWeight="500" tone="secondary">
                                {key}
                            </Body>
                        ) : null}
                    </YStack>
                    {steps ? (
                        <Secondary fontSize={13} fontWeight="700" tabular numberOfLines={1}>
                            {t('orderDetail.details.steps', { count: steps })}
                        </Secondary>
                    ) : null}
                </XStack>
            </Card>
        </Section>
    );
}

/* -- Facilitator. ------------------------------------------------------------ */

function Facilitator({ order, t, openUrl }: { order: OrderRecord; t: T; openUrl: (url: string) => Promise<unknown> }) {
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
                <XStack alignItems="center" gap={12}>
                    <Initials name={name} square />
                    <YStack flex={1} gap={2}>
                        <Body fontSize={16} fontWeight="800">
                            {name}
                        </Body>
                        {kindLabel ? <Secondary fontSize={13}>{kindLabel}</Secondary> : null}
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

function ServiceRate({ order, t }: { order: OrderRecord; t: T }) {
    // The organisation decides whether its drivers see what an order is charged at.
    const { showServiceRate } = useNavigatorSettings();
    const rate = showServiceRate ? purchaseRateOf(order as { purchase_rate?: unknown }) : undefined;
    const { items } = useServiceQuote(serviceQuoteIdOf(rate));
    if (!rate || rate.amount == null) return null;
    const currency = text(rate.currency) ?? undefined;
    return (
        <Section
            label={t('orderDetail.details.rate')}
            aside={
                rate.service_name ? (
                    <Secondary fontSize={13} fontWeight="700" numberOfLines={1}>
                        {rate.service_name}
                    </Secondary>
                ) : undefined
            }
        >
            <Card testID="order-rate">
                <YStack gap={12}>
                    {items.map((item, index) => (
                        <XStack key={item.id ?? index} alignItems="baseline" justifyContent="space-between" gap={12} testID={`order-rate-line-${index}`}>
                            <YStack flex={1}>
                                <Body fontSize={15} fontWeight="700">
                                    {text(item.details) ?? (item.code ? humanizeStatus(item.code) : t('orderDetail.details.rateLine'))}
                                </Body>
                            </YStack>
                            <Body fontSize={15} fontWeight="700" tabular>
                                {formatMoney(item.amount, text(item.currency) ?? currency)}
                            </Body>
                        </XStack>
                    ))}
                    {items.length ? <Rule /> : null}
                    <XStack alignItems="baseline" justifyContent="space-between" gap={12}>
                        <Body fontSize={15} fontWeight="800">
                            {t('orderDetail.details.rateTotal')}
                        </Body>
                        <Body fontSize={22} fontWeight="800" tabular testID="order-rate-total">
                            {formatMoney(rate.amount, currency)}
                        </Body>
                    </XStack>
                </YStack>
            </Card>
        </Section>
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

function Files({ order, t, openUrl }: { order: OrderRecord; t: T; openUrl: (url: string) => Promise<unknown> }) {
    const files = (Array.isArray((order as Rec).files) ? ((order as Rec).files as OrderFile[]) : []).filter(Boolean);
    if (!files.length) return null;
    return (
        <Section label={t('orderDetail.details.files', { count: files.length })}>
            <Card padded={false} testID="order-files">
                {files.map((file, index) => {
                    const name = text(file.original_filename) ?? text(file.caption) ?? t('orderDetail.details.fileUnnamed');
                    const info = [formatBytes(file.file_size), file.created_at ? t('orderDetail.details.fileAdded', { time: stamp(file.created_at) }) : null].filter(Boolean).join(' · ');
                    const url = text(file.url);
                    return (
                        <YStack key={file.id ?? index}>
                            {index > 0 ? <Rule /> : null}
                            <XStack
                                alignItems="center"
                                gap={12}
                                paddingVertical={12}
                                paddingHorizontal={14}
                                onPress={url ? () => void openUrl(url).catch(() => undefined) : undefined}
                                pressStyle={url ? { opacity: 0.7 } : undefined}
                                accessibilityRole={url ? 'button' : undefined}
                                accessibilityLabel={t('orderDetail.details.fileOpen', { name })}
                                testID={`order-file-${file.id ?? index}`}
                            >
                                <YStack width={44} height={44} borderRadius={12} alignItems="center" justifyContent="center" backgroundColor="$surfaceRaised" borderWidth={1} borderColor="$border">
                                    <Body fontSize={11} fontWeight="800" letterSpacing={0.4}>
                                        {fileKind(file)}
                                    </Body>
                                </YStack>
                                <YStack flex={1} gap={2}>
                                    <Body fontSize={15} fontWeight="800" numberOfLines={1}>
                                        {name}
                                    </Body>
                                    {info ? (
                                        <Secondary fontSize={13} tabular>
                                            {info}
                                        </Secondary>
                                    ) : null}
                                </YStack>
                                {url ? <Glyph name="chevron" size={16} strokeWidth={2.4} /> : null}
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
        <YStack gap={12} testID={`order-comment-${comment.id}`}>
            <XStack alignItems="flex-start" gap={12} paddingStart={reply ? 48 : 0}>
                <Initials name={name} size={reply ? 28 : 36} />
                <YStack flex={1} gap={4}>
                    <XStack alignItems="baseline" justifyContent="space-between" gap={8}>
                        <Body flex={1} fontSize={15} fontWeight="800" numberOfLines={1}>
                            {name}
                        </Body>
                        <Secondary fontSize={13} tabular numberOfLines={1}>
                            {comment.pending ? t('orderDetail.details.commentPending') : stamp(comment.created_at)}
                        </Secondary>
                    </XStack>
                    <Body fontSize={15} lineHeight={22}>
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

/**
 * Read and write. Unlike the other sections this one is always there once it
 * has loaded, because an empty thread is still somewhere to leave a note.
 */
function Comments({ orderId, reloadToken, t }: { orderId: string; reloadToken: number; t: T }) {
    const { comments, isLoading, failed, post, isPosting, postError } = useOrderComments(orderId, reloadToken);
    const [draft, setDraft] = useState('');
    const [queued, setQueued] = useState(false);

    const send = async () => {
        const outcome = await post(draft);
        if (outcome === 'failed') return;
        setDraft('');
        setQueued(outcome === 'queued');
    };

    // Could not be read and nothing to show: leave the section out rather than draw an error box.
    if (failed && !comments) return null;
    const count = comments?.length ?? 0;

    return (
        <Section label={count ? t('orderDetail.details.commentsCount', { count }) : t('orderDetail.details.comments')}>
            <Card testID="order-comments">
                <YStack gap={14}>
                    {isLoading ? <Skeleton height={48} /> : null}
                    {(comments ?? []).map((comment) => (
                        <CommentRow key={comment.id} comment={comment} t={t} />
                    ))}
                    {queued ? <Banner tone="neutral" message={t('orderDetail.details.commentQueued')} testID="order-comment-queued" /> : null}
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
            </Card>
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
                minHeight={52}
                paddingVertical={8}
                paddingEnd={14}
                paddingStart={14 + depth * 14}
                onPress={summary.nested ? () => setOpen((v) => !v) : undefined}
                pressStyle={summary.nested ? { opacity: 0.7 } : undefined}
                accessibilityRole={summary.nested ? 'button' : undefined}
                accessibilityState={summary.nested ? { expanded: open } : undefined}
                testID={`order-meta-${name}`}
            >
                <Body width={138 - depth * 14} fontFamily="$mono" fontSize={13} fontWeight="500" tone="secondary">
                    {name}
                </Body>
                <Body flex={1} fontFamily="$mono" fontSize={14} fontWeight="600" tone={summary.nested ? 'brand' : 'primary'} selectable={!summary.nested}>
                    {summary.text}
                </Body>
                {summary.nested ? <Glyph name={open ? 'chevronDown' : 'chevron'} size={16} strokeWidth={2.4} /> : null}
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

function Metadata({ order, t }: { order: OrderRecord; t: T }) {
    const entries = Object.entries(recordOf(order.meta) ?? {});
    if (!entries.length) return null;
    return (
        <Section
            label={t('orderDetail.details.meta', { count: entries.length })}
            aside={
                <Secondary fontSize={13} fontWeight="700" numberOfLines={1}>
                    {t('orderDetail.details.metaAside')}
                </Secondary>
            }
        >
            <Card padded={false} testID="order-meta">
                {entries.map(([key, value], index) => (
                    <YStack key={key}>
                        {index > 0 ? <Rule /> : null}
                        <MetaRow name={key} value={value} depth={0} t={t} />
                    </YStack>
                ))}
            </Card>
        </Section>
    );
}

/**
 * The order type's own fields. On the driver API the order lists their keys in
 * `custom_fields` and carries each value beside its other attributes
 * (HasCustomFields::withCustomFields; a key that clashes is prefixed `_`).
 */
function CustomFields({ order, t }: { order: OrderRecord; t: T }) {
    const keys = Array.isArray((order as Rec).custom_fields) ? ((order as Rec).custom_fields as unknown[]).filter((k): k is string => typeof k === 'string') : [];
    const entries = keys.map((key) => [key, (order as Rec)[key] ?? (order as Rec)[`_${key}`]] as const).filter(([, value]) => value !== null && value !== undefined && value !== '');
    if (!entries.length) return null;
    return (
        <Section label={t('orderDetail.details.customFields', { count: entries.length })}>
            <Card padded={false} testID="order-custom-fields">
                {entries.map(([key, value], index) => (
                    <YStack key={key}>
                        {index > 0 ? <Rule /> : null}
                        <MetaRow name={key} value={value} depth={0} t={t} />
                    </YStack>
                ))}
            </Card>
        </Section>
    );
}

/* -- Timeline. --------------------------------------------------------------- */

function Timeline({ orderId, onOpenTimeline, t }: { orderId: string; onOpenTimeline?: () => void; t: T }) {
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

/* -- The tab. ---------------------------------------------------------------- */

export function OrderDetails({
    order,
    config,
    reloadToken = 0,
    onOpenTimeline,
    openUrl = (url: string) => Linking.openURL(url),
}: {
    order: OrderRecord;
    config?: OrderConfig | null;
    reloadToken?: number;
    onOpenTimeline?: () => void;
    /** Injected in tests; defaults to Linking. */
    openUrl?: (url: string) => Promise<unknown>;
}) {
    const { t } = useTranslation();
    return (
        <YStack gap={20} testID="order-details-tab">
            <Identifiers order={order} t={t} />
            <Codes order={order} t={t} />
            <Dates order={order} t={t} />
            <OrderType order={order} config={config} t={t} />
            <Facilitator order={order} t={t} openUrl={openUrl} />
            <ServiceRate order={order} t={t} />
            <Files order={order} t={t} openUrl={openUrl} />
            <Comments orderId={order.id} reloadToken={reloadToken} t={t} />
            <CustomFields order={order} t={t} />
            <Metadata order={order} t={t} />
            <Timeline orderId={order.id} onOpenTimeline={onOpenTimeline} t={t} />
        </YStack>
    );
}

export default OrderDetails;
