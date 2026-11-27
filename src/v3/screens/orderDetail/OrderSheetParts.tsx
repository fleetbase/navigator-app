/**
 * The pieces of the order's sheet — design round 3 (OrderCombined.dc.html,
 * OrderCombinedScroll.dc.html).
 *
 * The order screen is a map with a sheet over it. These are the parts that
 * belong to that layout and to nothing else: the round buttons that float over
 * the map, the sheet's fixed header (QR code, tracking number, status), the
 * section index under it, the "now" card, the trip rail, what proof the order
 * will ask for, and the enlarged QR code.
 *
 * None of them fetch anything: the screen works out what to say and these draw it.
 */
import { useEffect, useRef } from 'react';
import { Image } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Secondary } from '../../ui/Text';
import { StatusPill } from '../../ui/StatusPill';
import { SheetModal } from '../../ui/SheetModal';
import { StopBadge } from '../../ui/RouteMap';
import { formatClock, formatDuration, formatMeters } from '../../format';
import { placeLines } from '../../data/placeText';
import { Card, Section, SectionLabel } from '../jobs/parts';
import type { OrderPoint } from '../jobs/model';
import { DottedRail, HomeIcon, type HomeIconName } from '../home/parts';
import { CountBadge, SectionLink } from './OrderSections';

type T = (key: string, options?: Record<string, unknown>) => string;

/* -- Over the map. ------------------------------------------------------------ */

const MAP_BUTTON_PATHS = {
    back: 'M15 5l-7 7 7 7',
    chat: 'M4 5h16v11H9l-5 4V5z',
} as const;

export type MapButtonIcon = keyof typeof MAP_BUTTON_PATHS;

/**
 * A 44dp round button on the map: back on the left, the order's shortcuts on
 * the right. Flat: its border is what sets it off the map, not a shadow.
 * `busy` is for a button whose press is still being answered (the chat being
 * opened): it dims and takes no second press.
 */
export function MapButton({ icon, label, onPress, badge, busy, testID }: { icon: MapButtonIcon; label: string; onPress?: () => void; badge?: number; busy?: boolean; testID?: string }) {
    const theme = useTheme();
    return (
        <YStack
            width={44}
            height={44}
            borderRadius={22}
            alignItems="center"
            justifyContent="center"
            backgroundColor="$background"
            borderWidth={1}
            borderColor="$border"
            opacity={busy ? 0.6 : 1}
            onPress={busy ? undefined : onPress}
            pressStyle={{ opacity: 0.7 }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ busy: !!busy }}
            testID={testID}
        >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={theme.textPrimary?.val as string} strokeWidth={icon === 'back' ? 2.4 : 2.2} strokeLinecap="round" strokeLinejoin="round">
                <Path d={MAP_BUTTON_PATHS[icon]} />
            </Svg>
            <CountBadge count={badge} offset={-3} />
        </YStack>
    );
}

/* -- The sheet's header. ------------------------------------------------------- */

/**
 * Fixed at the top of the sheet: the order's QR code on the left (tap to show
 * it larger), then what the order is, its tracking number in full, and its
 * status. With no QR image on the order there is no tile: a drawn one would be
 * a code that scans to nothing.
 *
 * All three start on the same line: the top of the QR tile, the top of the
 * eyebrow and the top of the status. The status is a button when the screen
 * gives it somewhere to go (the order's activity).
 */
export function SheetHeader({
    eyebrow,
    kindTestID,
    trackingNumber,
    status,
    qr,
    qrLabel,
    onOpenQr,
    onOpenStatus,
    statusLabel,
    t,
}: {
    eyebrow: string;
    kindTestID?: string;
    trackingNumber: string;
    status?: string | null;
    qr?: { uri: string };
    qrLabel: string;
    onOpenQr?: () => void;
    /** Opens the order's activity; makes the status a button. */
    onOpenStatus?: () => void;
    /** Spoken for the status when it is a button. */
    statusLabel?: string;
    t: T;
}) {
    const theme = useTheme();
    return (
        <XStack alignItems="flex-start" gap={12} paddingHorizontal={16} paddingBottom={10} testID="order-identity">
            {qr ? (
                <YStack
                    width={52}
                    height={52}
                    padding={5}
                    borderRadius={12}
                    flexShrink={0}
                    alignItems="center"
                    justifyContent="center"
                    // A code is always dark on white, whatever the theme: that is what a scanner reads.
                    backgroundColor="#FFFFFF"
                    onPress={onOpenQr}
                    pressStyle={{ opacity: 0.8 }}
                    accessibilityRole="button"
                    accessibilityLabel={qrLabel}
                    testID="order-qr-tile"
                >
                    <Image source={qr} style={{ width: 42, height: 42 }} resizeMode="contain" />
                    <YStack position="absolute" right={-5} bottom={-5} width={20} height={20} borderRadius={10} alignItems="center" justifyContent="center" backgroundColor="$surfaceRaised" borderWidth={1.5} borderColor="$background">
                        <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={theme.textPrimary?.val as string} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
                        </Svg>
                    </YStack>
                </YStack>
            ) : null}
            {/* No padding above: the eyebrow's capitals start level with the top of the QR tile (the line box leaves a little air above them, taken back here). */}
            <YStack flex={1} minWidth={0} marginTop={-2}>
                <SectionLabel testID={kindTestID}>{eyebrow}</SectionLabel>
                {/* In full, on as many lines as it needs: an identifier is never cut short. */}
                <Body fontFamily="$mono" fontSize={17} lineHeight={22} fontWeight="600" selectable testID="order-tracking-number">
                    {trackingNumber}
                </Body>
            </YStack>
            <YStack flexShrink={0} alignSelf="flex-start">
                <StatusPill status={status} t={(k, fb) => t(k, { defaultValue: fb })} onPress={onOpenStatus} accessibilityLabel={onOpenStatus ? statusLabel : undefined} testID="order-status" />
            </YStack>
        </XStack>
    );
}

/**
 * The section index under the header: one pill per section the order has. A
 * row that runs wider than the sheet scrolls sideways (with no scroll bar), and
 * keeps the active pill in view as the sections scroll under it.
 */
export function SectionPills<K extends string>({ items, active, onSelect, label }: { items: { key: K; label: string }[]; active?: K; onSelect: (key: K) => void; label: string }) {
    const scroll = useRef<ScrollView>(null);
    const lefts = useRef<Record<string, number>>({});
    useEffect(() => {
        if (!active) return;
        const x = lefts.current[active];
        if (typeof x === 'number') scroll.current?.scrollTo({ x: Math.max(0, x - 48), animated: true });
    }, [active]);
    if (items.length < 2) return null;
    return (
        <ScrollView
            ref={scroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: items.length >= 5 ? 'space-between' : 'flex-start', gap: items.length >= 5 ? 2 : 6, paddingHorizontal: 16, paddingBottom: 10 }}
            accessibilityRole="tablist"
            accessibilityLabel={label}
            testID="order-index"
        >
            {items.map((item) => {
                const on = item.key === active;
                return (
                    <YStack
                        key={item.key}
                        height={32}
                        paddingHorizontal={10}
                        borderRadius={16}
                        alignItems="center"
                        justifyContent="center"
                        backgroundColor={on ? '$textPrimary' : 'transparent'}
                        onLayout={(event) => {
                            lefts.current[item.key] = event.nativeEvent.layout.x;
                        }}
                        onPress={() => onSelect(item.key)}
                        pressStyle={{ opacity: 0.7 }}
                        hitSlop={6}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                        testID={`order-index-${item.key}`}
                    >
                        <Body fontSize={13} lineHeight={17} fontWeight={on ? '800' : '700'} color={on ? '$background' : '$textSecondary'} numberOfLines={1}>
                            {item.label}
                        </Body>
                    </YStack>
                );
            })}
        </ScrollView>
    );
}

/* -- Now. ---------------------------------------------------------------------- */

export interface NowNote {
    text: string;
    /** `success` and `danger` carry a tick or a warning mark beside the words. */
    tone: 'success' | 'danger' | 'neutral';
}

/**
 * The step to do and how far the next waypoint is. The one card on the sheet
 * with the brand's ring around it, because it is the one about this moment.
 */
export function NowCard({
    eyebrow,
    title,
    line,
    note,
    navigate,
    children,
}: {
    eyebrow: string;
    title?: string;
    /** "1.1 km · 3 min · arrive 14:17" — only the figures the server gave. */
    line?: string;
    note?: NowNote;
    navigate?: { label: string; onPress: () => void };
    /** Other ways the order can go from here, and what stands in the way. */
    children?: React.ReactNode;
}) {
    const theme = useTheme();
    return (
        // The ring is drawn outside the card's own box, as the mockup's is, so the card keeps the gutter's width.
        <YStack margin={-4} padding={4} borderRadius={22} backgroundColor="$primaryFill">
            <YStack padding={14} gap={10} borderRadius={18} backgroundColor="$surface" borderWidth={1.5} borderColor="$primary" testID="order-now">
                <YStack>
                    <SectionLabel tone="brand">{eyebrow}</SectionLabel>
                    {title ? (
                        <Body fontSize={22} lineHeight={28} fontWeight="800" letterSpacing={-0.2} testID="order-now-step">
                            {title}
                        </Body>
                    ) : null}
                </YStack>
                {line || note ? (
                    <YStack gap={2} testID="order-eta-strip">
                        {line ? (
                            <Body fontSize={18} lineHeight={24} fontWeight="800" tabular>
                                {line}
                            </Body>
                        ) : null}
                        {note ? (
                            <XStack alignItems="center" gap={5}>
                                {note.tone === 'neutral' ? null : <HomeIcon name={note.tone === 'success' ? 'tick' : 'issue'} color={(note.tone === 'success' ? theme.successText?.val : theme.dangerText?.val) as string} size={13} />}
                                <Body flexShrink={1} fontSize={13} lineHeight={16} fontWeight="700" tabular tone={note.tone === 'neutral' ? 'secondary' : note.tone}>
                                    {note.text}
                                </Body>
                            </XStack>
                        ) : null}
                    </YStack>
                ) : null}
                {children}
                {navigate ? (
                    <XStack
                        height={48}
                        gap={8}
                        alignItems="center"
                        justifyContent="center"
                        borderRadius={14}
                        backgroundColor="$surfaceRaised"
                        borderWidth={1}
                        borderColor="$primaryBorder"
                        onPress={navigate.onPress}
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityRole="button"
                        testID="navigate-to-dropoff"
                    >
                        <HomeIcon name="navigate" color={theme.primary?.val as string} size={16} />
                        <Body fontSize={15} lineHeight={20} fontWeight="700" numberOfLines={1}>
                            {navigate.label}
                        </Body>
                    </XStack>
                ) : null}
            </YStack>
        </YStack>
    );
}

/* -- Trip. --------------------------------------------------------------------- */

export interface TripExtra {
    key: string;
    label: string;
    text: string;
    testID?: string;
}

/**
 * A note about a place, in full, under its waypoint: it is there to be read
 * before arriving, so it is set off from the address in the note's own tint and
 * marked with the note icon (the same look as the order's own notes).
 */
function NoteLine({ text, testID }: { text: string; testID?: string }) {
    const theme = useTheme();
    return (
        <XStack alignItems="flex-start" gap={7} marginTop={8} paddingVertical={8} paddingHorizontal={10} borderRadius={12} borderWidth={1} borderColor="$warningBorder" backgroundColor="$warningFill" testID={testID}>
            <YStack marginTop={2} flexShrink={0}>
                <HomeIcon name="note" color={theme.warningText?.val as string} size={15} />
            </YStack>
            <Body flex={1} fontSize={14} lineHeight={20} selectable>
                {text}
            </Body>
        </XStack>
    );
}

/**
 * Every waypoint on the order as a rail, in working order. The one being
 * headed to (or, before the order starts, the one it starts at) is spelled out
 * with its window; each carries its note in full and the road on to the next.
 */
export function TripSection({
    points,
    started,
    color,
    legs = [],
    units,
    notes = {},
    extras = [],
    onChange,
    t,
}: {
    points: OrderPoint[];
    started: boolean;
    /** The order's colour, for its numbered waypoints (the console's). */
    color?: string;
    /** The tracker's legs: one per waypoint still to do, the first ending at the one being headed to. */
    legs?: { distance_m?: number | null; duration_s?: number | null }[];
    units: 'metric' | 'imperial';
    /** The notes of each point, by index: every one the order carries for that place. Shown with the point's own, each once. */
    notes?: Record<number, string[] | undefined>;
    /** Things said about the whole order: the booked slot, the order's notes. */
    extras?: TripExtra[];
    /** Present when the order has more than one place to choose between. */
    onChange?: () => void;
    t: T;
}) {
    if (!points.length) return null;
    // Before the order starts nothing is "being headed to", but the first point is still where it begins.
    const focus = points.find((p) => p.state === 'current') ?? (started ? undefined : points.find((p) => p.state === 'later'));
    const firstPending = points.findIndex((p) => p.state !== 'done' && p.state !== 'skipped');
    const roleOf = (p: OrderPoint) =>
        p.role === 'pickup'
            ? t('jobs.role.pickup')
            : p.role === 'dropoff'
              ? t('jobs.role.dropoff')
              : p.waypointNumber && p.waypointTotal && p.waypointTotal > 1
                ? t('jobs.role.waypointOf', { number: p.waypointNumber, total: p.waypointTotal })
                : t('jobs.role.waypoint');
    return (
        <Section
            label={t('orderDetail.trip.heading', { count: points.length })}
            aside={
                /*
                 * Only offered on an order with somewhere else to go. A
                 * single-place order presents no choice, and a link that opens
                 * a list of one is a link that wasted the driver's tap.
                 */
                onChange ? <SectionLink label={t('orderDetail.trip.change')} onPress={onChange} testID="change-destination" /> : undefined
            }
        >
            <Card testID="order-waypoints">
                {points.map((point, index) => {
                    const isFocus = point === focus;
                    const last = index === points.length - 1;
                    const done = point.state === 'done';
                    const tag = [roleOf(point), done ? t('jobs.state.done') : isFocus ? t(point.state === 'current' ? 'jobs.state.heading' : 'orderDetail.startsHere') : null].filter(Boolean).join(' · ');
                    const window =
                        done || !point.windowEnd
                            ? undefined
                            : point.windowStart
                              ? t('orderDetail.trip.window', { window: `${formatClock(point.windowStart)}–${formatClock(point.windowEnd)}` })
                              : t('home.trip.dueBy', { time: formatClock(point.windowEnd) });
                    // Every note for this place, each once and in full.
                    const pointNotes = [point.note, ...(notes[index] ?? [])]
                        .map((note) => (typeof note === 'string' ? note.trim() : ''))
                        .filter((note, at, all) => !!note && all.indexOf(note) === at);
                    // Legs run from the driver through the waypoints still to do, so the leg out of this one sits one past its place among those.
                    const leg = firstPending >= 0 && index >= firstPending && !last ? legs[index - firstPending + 1] : undefined;
                    const legText =
                        leg && Number.isFinite(Number(leg.distance_m)) && Number(leg.distance_m) > 0
                            ? [formatMeters(Number(leg.distance_m), units), leg.duration_s != null && Number.isFinite(Number(leg.duration_s)) ? formatDuration(Number(leg.duration_s)) : undefined].filter(Boolean).join(' · ')
                            : undefined;
                    // A place saved without a name or a street still reads as a place: stray separators are trimmed (data/placeText).
                    const lines = placeLines({ name: point.name, address: point.address });
                    const name = lines.title ?? t('jobs.unnamed', { sequence: index + 1 });
                    return (
                        <XStack key={point.id ?? index} gap={8} testID={`order-waypoint-${index}`}>
                            <YStack width={44} alignItems="center">
                                <StopBadge kind={point.role} number={point.waypointNumber} color={color} state={done ? 'done' : isFocus ? 'current' : 'pending'} />
                                {last ? null : <DottedRail />}
                            </YStack>
                            <YStack flex={1} minWidth={0} paddingTop={4} paddingBottom={last ? 0 : 12} opacity={done ? 0.6 : 1}>
                                <SectionLabel tone={done ? 'muted' : isFocus ? 'success' : 'muted'}>{tag}</SectionLabel>
                                {isFocus || !window ? (
                                    <Body fontSize={isFocus ? 17 : 16} lineHeight={isFocus ? 22 : 21} fontWeight={isFocus ? '800' : '700'} letterSpacing={isFocus ? -0.2 : 0}>
                                        {name}
                                    </Body>
                                ) : (
                                    <XStack alignItems="baseline" justifyContent="space-between" gap={10}>
                                        <Body flex={1} fontSize={16} lineHeight={21} fontWeight="700">
                                            {name}
                                        </Body>
                                        <Secondary flexShrink={0} fontSize={14} fontWeight="700" tabular numberOfLines={1}>
                                            {window}
                                        </Secondary>
                                    </XStack>
                                )}
                                {lines.address ? (
                                    <Secondary fontSize={13} lineHeight={17}>
                                        {lines.address}
                                    </Secondary>
                                ) : null}
                                {isFocus && window ? (
                                    <Body fontSize={14} lineHeight={20} fontWeight="700" tabular paddingTop={4}>
                                        {window}
                                    </Body>
                                ) : null}
                                {pointNotes.map((note, at) => (
                                    <NoteLine key={at} text={note} testID={at ? `order-waypoint-${index}-note-${at}` : `order-waypoint-${index}-note`} />
                                ))}
                                {legText ? (
                                    <Secondary fontSize={12} lineHeight={16} fontWeight="700" tabular paddingTop={8}>
                                        {t('orderDetail.trip.then', { leg: legText })}
                                    </Secondary>
                                ) : null}
                            </YStack>
                        </XStack>
                    );
                })}
                {extras.map((extra) => (
                    <YStack key={extra.key} marginTop={12} paddingTop={10} borderTopWidth={1} borderColor="$border" testID={extra.testID}>
                        <SectionLabel>{extra.label}</SectionLabel>
                        <Body fontSize={14} lineHeight={20} paddingTop={2} selectable>
                            {extra.text}
                        </Body>
                    </YStack>
                ))}
            </Card>
        </Section>
    );
}

/* -- Proof. -------------------------------------------------------------------- */

export interface ProofRow {
    key: string;
    method: 'scan' | 'photo' | 'signature';
    /** The step that asks for it, in the driver's words. */
    step: string;
    captured: boolean;
}

const PROOF_ICONS: Record<ProofRow['method'], HomeIconName> = { scan: 'scan', photo: 'camera', signature: 'pen' };

/** What the order will ask the driver to capture, and on which step. Absent when it asks for nothing. */
export function ProofSection({ rows, t }: { rows: ProofRow[]; t: T }) {
    const theme = useTheme();
    if (!rows.length) return null;
    return (
        <Section label={t('orderDetail.proof.heading')}>
            <Card padded={false} testID="order-proof">
                {rows.map((row, index) => (
                    <XStack key={row.key} alignItems="center" gap={12} paddingVertical={10} paddingHorizontal={14} borderTopWidth={index ? 1 : 0} borderColor="$border" testID={`order-proof-${row.key}`}>
                        <YStack width={36} height={36} borderRadius={12} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor="$surfaceRaised">
                            <HomeIcon name={PROOF_ICONS[row.method]} color={theme.textPrimary?.val as string} size={18} />
                        </YStack>
                        <YStack flex={1} minWidth={0}>
                            <Body fontSize={16} lineHeight={21} fontWeight="800">
                                {t(`orderDetail.proof.method.${row.method}`)}
                            </Body>
                            <Secondary fontSize={13} lineHeight={17}>
                                {t('orderDetail.proof.onStep', { step: row.step })}
                            </Secondary>
                        </YStack>
                        {/* A mark and a word, never the colour alone. */}
                        <XStack flexShrink={0} alignItems="center" gap={5}>
                            <HomeIcon name={row.captured ? 'tick' : 'clock'} color={(row.captured ? theme.successText?.val : theme.textSecondary?.val) as string} size={13} />
                            <Secondary fontSize={13} fontWeight="700" tone={row.captured ? 'success' : 'secondary'} numberOfLines={1}>
                                {t(row.captured ? 'orderDetail.proof.captured' : 'orderDetail.proof.notYet')}
                            </Secondary>
                        </XStack>
                    </XStack>
                ))}
            </Card>
        </Section>
    );
}

/* -- Last on the sheet. --------------------------------------------------------- */

export function ReportIssueButton({ label, onPress }: { label: string; onPress: () => void }) {
    const theme = useTheme();
    return (
        <XStack height={48} gap={8} alignItems="center" justifyContent="center" borderRadius={14} borderWidth={1} borderColor="$border" onPress={onPress} pressStyle={{ opacity: 0.7 }} accessibilityRole="button" testID="report-issue">
            <HomeIcon name="issue" color={theme.warningText?.val as string} size={16} />
            <Body fontSize={15} lineHeight={20} fontWeight="700" numberOfLines={1}>
                {label}
            </Body>
        </XStack>
    );
}

/* -- The QR code, enlarged. ------------------------------------------------------ */

/** Opened from the header's tile: the code at a size a scanner reads at arm's length. */
export function QrSheet({ visible, onClose, qr, number, title, closeLabel, bottomInset = 0 }: { visible: boolean; onClose: () => void; qr?: { uri: string }; number?: string; title: string; closeLabel: string; bottomInset?: number }) {
    return (
        <SheetModal visible={visible} onClose={onClose} dismissLabel={closeLabel} testID="order-qr-sheet">
            <YStack padding={16} paddingBottom={Math.max(bottomInset, 16)} gap={14} alignItems="center" backgroundColor="$background" borderTopLeftRadius={26} borderTopRightRadius={26} borderWidth={1} borderColor="$border">
                <Body fontSize={16} lineHeight={21} fontWeight="800" center>
                    {title}
                </Body>
                {qr ? (
                    <YStack padding={14} borderRadius={16} backgroundColor="#FFFFFF">
                        <Image source={qr} style={{ width: 260, height: 260 }} resizeMode="contain" accessibilityLabel={title} testID="order-qr-large" />
                    </YStack>
                ) : null}
                {number ? (
                    <Body fontFamily="$mono" fontSize={17} lineHeight={22} fontWeight="600" selectable center>
                        {number}
                    </Body>
                ) : null}
                <YStack alignSelf="stretch" height={48} borderRadius={14} alignItems="center" justifyContent="center" backgroundColor="$surfaceRaised" borderWidth={1} borderColor="$border" onPress={onClose} pressStyle={{ opacity: 0.7 }} accessibilityRole="button" testID="order-qr-close">
                    <Body fontSize={15} fontWeight="700" numberOfLines={1}>
                        {closeLabel}
                    </Body>
                </YStack>
            </YStack>
        </SheetModal>
    );
}
