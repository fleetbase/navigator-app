/**
 * StatusPill — a status, drawn the way the FleetOps console draws one.
 *
 * The console's `<Badge @status=…>` (ember-ui, addon/components/badge and
 * addon/styles/components/badge.css) gives each status a colour family: a
 * filled pill in the family's dark shade, a border one step lighter, pale text
 * and a dot. The same status → family table is kept here (`CONSOLE_FAMILY`), so
 * "Dispatched" is green and "Driver enroute" is yellow in the app exactly as
 * they are in the console. A status the console has no rule for takes the
 * family nearest the app's own tone for it, rather than the console's plain
 * grey, so the fuel-report, issue and manifest statuses keep telling apart.
 *
 * In a dark scheme the colours are the console's own (shade 800 fill, 700
 * border, 100 text, 300 dot). In a light scheme the same family is used the
 * other way up (100 fill, 300 border, 800 text, 600 dot) so the pill sits on a
 * white sheet without becoming a dark block.
 *
 * Never colour alone: the pill always carries the status in words, and its
 * marker keeps a distinct shape per tone, so it still reads under glare, in
 * greyscale, and for colour-blind drivers.
 */
import { XStack, YStack, styled, useTheme } from 'tamagui';
import { Micro } from './Text';
import { describeStatus, normalizeStatus, type StatusShape, type StatusTone } from '../theme/status';
import { luminance } from '../theme/palette';
import { radius, space } from '../theme/tokens';

const Marker = styled(YStack, {
    name: 'StatusMarker',
    width: 8,
    height: 8,
    variants: {
        shape: {
            circle: { borderRadius: 999 },
            square: { borderRadius: 2 },
            diamond: { borderRadius: 2, rotate: '45deg' },
        } as Record<StatusShape, object>,
    } as const,
});

/* -- The console's colours. ---------------------------------------------------- */

type Family = 'green' | 'sky' | 'emerald' | 'cyan' | 'violet' | 'slate' | 'gray' | 'red' | 'yellow' | 'indigo' | 'orange' | 'blue';

/** Tailwind's shades, which the console's badge rules are written in: 100, 300, 600, 700, 800. */
const SHADES: Record<Family, [string, string, string, string, string]> = {
    green: ['#DCFCE7', '#86EFAC', '#16A34A', '#15803D', '#166534'],
    sky: ['#E0F2FE', '#7DD3FC', '#0284C7', '#0369A1', '#075985'],
    emerald: ['#D1FAE5', '#6EE7B7', '#059669', '#047857', '#065F46'],
    cyan: ['#CFFAFE', '#67E8F9', '#0891B2', '#0E7490', '#155E75'],
    violet: ['#EDE9FE', '#C4B5FD', '#7C3AED', '#6D28D9', '#5B21B6'],
    slate: ['#F1F5F9', '#CBD5E1', '#475569', '#334155', '#1E293B'],
    gray: ['#F3F4F6', '#D1D5DB', '#4B5563', '#374151', '#1F2937'],
    red: ['#FEE2E2', '#FCA5A5', '#DC2626', '#B91C1C', '#991B1B'],
    yellow: ['#FEF9C3', '#FDE047', '#CA8A04', '#A16207', '#854D0E'],
    indigo: ['#E0E7FF', '#A5B4FC', '#4F46E5', '#4338CA', '#3730A3'],
    orange: ['#FFEDD5', '#FDBA74', '#EA580C', '#C2410C', '#9A3412'],
    blue: ['#DBEAFE', '#93C5FD', '#2563EB', '#1D4ED8', '#1E40AF'],
};

/** The console fills these two with shade 700 rather than 800 (badge.css). */
const FILLED_AT_700: Family[] = ['yellow', 'orange'];

function familyStatuses(family: Family, statuses: string): [string, Family][] {
    return statuses.split(' ').map((status) => [status, family]);
}

/**
 * status → family, as badge.css has it (its class names, with `-` as `_`).
 * Where the stylesheet lists a status twice, the later rule is the one that
 * applies there, and so here (`disabled` is red).
 */
const CONSOLE_FAMILY: Record<string, Family> = Object.fromEntries([
    ...familyStatuses(
        'green',
        'confirmed confirm resolved published live online connected created open enabled success succeeded reimbursed dispatched operational active available completed accepted posted paid settled captured'
    ),
    ...familyStatuses('sky', 'wont_fix'),
    ...familyStatuses('emerald', 'ready verified low allocated'),
    ...familyStatuses('cyan', 'in_review started normal returned'),
    ...familyStatuses('violet', 'duplicate backlogged delivery handed_over'),
    ...familyStatuses('slate', 'closed not_configured not_verified not_tested requested'),
    ...familyStatuses('gray', 'reviewed'),
    ...familyStatuses(
        'red',
        'faulty degraded error connection_failed sync_failed escalated urgent high rejected critical disabled disputed inactive failed cancelled canceled overdue void voided reversed chargeback breakdown'
    ),
    ...familyStatuses(
        'yellow',
        'in_transit idle draft re_opened enroute driver_enroute offline pending_review pending_activation awaiting_review scheduled_maintenance maintenance test warning synchronizing syncing sync_queued medium preparing trial trialing grace_period pending partial partially_paid sent viewed never_connected expired ignored'
    ),
    ...familyStatuses('indigo', 'journal_entry'),
    ...familyStatuses('orange', 'requires_capture extended'),
    ...familyStatuses('blue', 'refund provisioning'),
]);

/** For a status the console has no rule for: the family nearest the app's tone for it. */
const TONE_FAMILY: Record<StatusTone, Family> = {
    created: 'gray',
    preparing: 'blue',
    dispatched: 'blue',
    driver_assigned: 'indigo',
    driver_enroute: 'yellow',
    started: 'cyan',
    arrived: 'emerald',
    completed: 'green',
    canceled: 'slate',
    failed: 'red',
    on_hold: 'orange',
};

export interface StatusColors {
    fill: string;
    border: string;
    text: string;
    dot: string;
}

/** The colour family the console gives a status. */
export function statusFamily(status: unknown): Family {
    const key = normalizeStatus(status);
    return CONSOLE_FAMILY[key] ?? TONE_FAMILY[describeStatus(key).tone] ?? 'gray';
}

/** A status's pill colours on a dark or a light surface. */
export function statusColors(status: unknown, dark: boolean): StatusColors {
    const family = statusFamily(status);
    const [s100, s300, s600, s700, s800] = SHADES[family];
    if (dark) return { fill: FILLED_AT_700.includes(family) ? s700 : s800, border: s700, text: s100, dot: s300 };
    return { fill: s100, border: s300, text: s800, dot: s600 };
}

/** Whether the active scheme is a dark one, read from its own background. */
function useDarkSurface(): boolean {
    const theme = useTheme();
    const background = theme.background?.val;
    // Anything that is not a plain hex is treated as dark, which is what the app opens in.
    if (typeof background !== 'string' || !/^#[0-9a-f]{6}/i.test(background)) return true;
    return luminance(background.slice(0, 7)) < 0.4;
}

export interface StatusPillProps {
    /** Raw status straight from the API — normalisation happens in the registry. */
    status?: string | null;
    /** Override the rendered label; defaults to a humanised status. */
    label?: string;
    /** Translated label, if the caller has already resolved one. */
    t?: (key: string, fallback: string) => string;
    size?: 'sm' | 'md';
    /** Makes the pill a button: the order's header opens its activity with it. */
    onPress?: () => void;
    /** Spoken instead of "Status: …" when the pill is a button. */
    accessibilityLabel?: string;
    testID?: string;
}

export function StatusPill({ status, label, t, size = 'md', onPress, accessibilityLabel, testID }: StatusPillProps) {
    const dark = useDarkSurface();
    if (!status && !label) return null;

    const d = describeStatus(status);
    const text = label ?? (t ? t(d.labelKey, d.defaultLabel) : d.defaultLabel);
    const pad = size === 'sm' ? space[2] : space[3];
    const colors = statusColors(status, dark);

    return (
        <XStack
            testID={testID}
            alignItems="center"
            gap={space[2] - 2}
            alignSelf="flex-start"
            paddingHorizontal={pad}
            paddingVertical={size === 'sm' ? 3 : 5}
            borderRadius={radius.pill}
            borderWidth={1}
            backgroundColor={colors.fill}
            borderColor={colors.border}
            onPress={onPress}
            pressStyle={onPress ? { opacity: 0.7 } : undefined}
            hitSlop={onPress ? 10 : undefined}
            accessibilityRole={onPress ? 'button' : 'text'}
            accessibilityLabel={accessibilityLabel ?? `Status: ${text}`}
        >
            <Marker shape={d.shape} backgroundColor={colors.dot} />
            <Micro color={colors.text as any} fontWeight="700" numberOfLines={1}>
                {text}
            </Micro>
        </XStack>
    );
}

/**
 * Map pin / list bullet variant of the same status vocabulary.
 * `seq` renders the stop sequence number inside the pin.
 */
export function StatusMarkerPin({ status, seq, size = 26 }: { status?: string | null; seq?: number | string; size?: number }) {
    const d = describeStatus(status);
    return (
        <YStack
            width={size}
            height={size}
            alignItems="center"
            justifyContent="center"
            backgroundColor={d.textToken as any}
            // Teardrop: round on three corners, pointed bottom-left, rotated upright.
            borderTopLeftRadius={999}
            borderTopRightRadius={999}
            borderBottomRightRadius={999}
            borderBottomLeftRadius={4}
            rotate="-45deg"
        >
            <Micro rotate="45deg" color="$background" fontSize={size * 0.42}>
                {seq ?? d.glyph}
            </Micro>
        </YStack>
    );
}

export default StatusPill;
