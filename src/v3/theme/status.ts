/**
 * Canonical status registry.
 *
 * v2 had two unreconciled colour systems: semantic `$success`/`$successBorder`
 * tokens (used by Content.tsx and OrderWaypointList.tsx) and interpolated
 * Tailwind strings (`` `$${color}-100` ``, used by Badge.tsx and
 * OrderActivitySelect.tsx). Neither agreed, and `getColorFromStatus` mapped 38
 * strings onto 6 Tailwind family names with a `yellow` catch-all — so most
 * fuel-report statuses (Draft, Approved, Rejected, Revised…) rendered as an
 * undifferentiated yellow badge.
 *
 * This is the single source of truth. It resolves any status string the API can
 * produce — order, issue, fuel report, priority — to one of the design's 11
 * tones, plus the glyph and marker shape that make it legible without colour.
 *
 * Normalisation happens once, here: v2 did `.replace(/[\s-]/g,'_').toLowerCase()`
 * inside Badge.tsx only, so direct callers like OrderActivitySelect.tsx (which
 * passes `activity.code` straight through) silently missed.
 */
import { statusHues, type StatusTone, type StatusShape } from './palette';

export type { StatusTone, StatusShape };

export interface StatusDescriptor {
    tone: StatusTone;
    /** Theme token names — read these, never a raw hue. */
    fillToken: string;
    borderToken: string;
    textToken: string;
    glyph: string;
    shape: StatusShape;
    /** i18n key; falls back to `defaultLabel`. */
    labelKey: string;
    /**
     * Label to render when no translation exists. Uses the design's wording for
     * a known tone, and a humanised form of the raw status otherwise.
     */
    defaultLabel: string;
}

/** `driver_assigned` -> `driverAssigned` */
function camel(key: string): string {
    return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Normalise any inbound status to snake_case lower.
 * Handles the API's `driver_enroute`, the enums' `Pending Approval`, and
 * hyphenated `pending-review` alike.
 */
export function normalizeStatus(status: unknown): string {
    if (typeof status !== 'string') return '';
    return status.trim().replace(/[\s-]+/g, '_').toLowerCase();
}

/**
 * status → tone. Everything on the left is a real string produced by FleetOps
 * (order status, tracking status code, issue status/priority, fuel report
 * status) or by the v2 `getColorFromStatus` switch.
 */
const TONE_BY_STATUS: Record<string, StatusTone> = {
    // ── order lifecycle ──────────────────────────────────────────────────────
    created: 'created',
    preparing: 'preparing',
    pending: 'created',
    dispatched: 'dispatched',
    assigned: 'driver_assigned',
    driver_assigned: 'driver_assigned',
    enroute: 'driver_enroute',
    driver_enroute: 'driver_enroute',
    started: 'started',
    order_started: 'started',
    arrived: 'arrived',
    pickup_ready: 'arrived',
    completed: 'completed',
    order_completed: 'completed',
    canceled: 'canceled',
    cancelled: 'canceled',
    order_canceled: 'canceled',
    failed: 'failed',
    incomplete: 'failed',
    unable: 'failed',
    on_hold: 'on_hold',
    waypoint_created: 'created',

    // ── generic / operational ────────────────────────────────────────────────
    live: 'completed',
    success: 'completed',
    active: 'completed',
    operational: 'completed',
    disabled: 'canceled',
    info: 'preparing',
    warning: 'on_hold',

    // ── issue status ─────────────────────────────────────────────────────────
    // `open` and `resolved` are what a live instance actually returns for an
    // issue. Neither appears in src/constants/Enums.ts, so the coverage test —
    // which reads that file — could not have caught them; an open issue fell to
    // the fallback tone. Statuses seen on the wire count as much as declared ones.
    open: 'created',
    resolved: 'completed',
    reopened: 'driver_assigned',
    in_progress: 'started',
    backlogged: 'on_hold',
    requires_update: 'on_hold',
    in_review: 'preparing',
    pending_review: 'preparing',
    re_opened: 'driver_assigned',
    duplicate: 'canceled',
    escalated: 'failed',

    // ── issue priority ───────────────────────────────────────────────────────
    low: 'preparing',
    medium: 'on_hold',
    high: 'driver_enroute',
    critical: 'failed',
    scheduled_maintenance: 'dispatched',
    operational_suggestion: 'preparing',

    // ── fuel report status ───────────────────────────────────────────────────
    // v2 sent every one of these to the yellow default.
    draft: 'created',
    submitted: 'dispatched',
    pending_approval: 'preparing',
    approved: 'completed',
    confirmed: 'completed',
    rejected: 'failed',
    revised: 'on_hold',
    archived: 'canceled',

    // ── manifest / stop status (Phase 4) ─────────────────────────────────────
    draft_manifest: 'created',
    in_progress_manifest: 'started',
    skipped: 'canceled',
};

/**
 * The catch-all. v2 returned `yellow`, which silently pretended an unknown
 * status was a warning. `created` is the honest neutral — and `isKnownStatus`
 * lets callers tell the difference when it matters.
 */
export const FALLBACK_TONE: StatusTone = 'created';

export function isKnownStatus(status: unknown): boolean {
    return normalizeStatus(status) in TONE_BY_STATUS;
}

export function toneFor(status: unknown): StatusTone {
    return TONE_BY_STATUS[normalizeStatus(status)] ?? FALLBACK_TONE;
}

const descriptorCache = new Map<string, StatusDescriptor>();

/**
 * Resolve a raw status to everything a component needs to render it.
 * Cached — this is called per row in long lists.
 */
export function describeStatus(status: unknown): StatusDescriptor {
    const key = normalizeStatus(status);
    const cached = descriptorCache.get(key);
    if (cached) return cached;

    const tone = toneFor(key);
    const name = camel(tone);
    const { glyph, shape, label } = statusHues[tone];

    const descriptor: StatusDescriptor = {
        tone,
        fillToken: `$${name}Fill`,
        borderToken: `$${name}Border`,
        textToken: `$${name}Text`,
        glyph,
        shape,
        // A recognised status uses the design's label; an unrecognised one is
        // humanised so it is at least readable rather than raw snake_case.
        defaultLabel: isKnownStatus(key) ? label : humanizeStatus(key),
        // Reuse the existing (currently dead) orderStatuses.* namespace in
        // translations/en.json; unknown keys fall back to the humanised string.
        labelKey: `orderStatuses.${key || 'unknown'}`,
    };

    descriptorCache.set(key, descriptor);
    return descriptor;
}

/** Human-readable fallback when no translation exists. */
export function humanizeStatus(status: unknown): string {
    const key = normalizeStatus(status);
    if (!key) return '';
    return key.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Every status string the registry knows — used by the token/registry test. */
export const KNOWN_STATUSES = Object.keys(TONE_BY_STATUS);
