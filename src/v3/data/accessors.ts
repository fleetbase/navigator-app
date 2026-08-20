/**
 * Field accessors for the order payload.
 *
 * The v1 API is loosely typed and several fields have more than one shape
 * depending on the endpoint and its `?with=` expansion. Reading them inline
 * meant guessing, and guessing produced two real bugs against a live instance:
 *
 *   - `order_config` comes back as a **plain public id string**
 *     ("order_config_rvle6d5CAn"), not `{ id }`. Reading `.id` yielded
 *     undefined, so the activity stepper never loaded.
 *   - `tracking_number` is an **object** — `{ id, tracking_number,
 *     status_code, qr_code, … }` — not a string. `String(...)` on it renders
 *     "[object Object]" in place of the identifier the design is built around.
 *
 * Every screen goes through these so a shape surprise is fixed in one place.
 */
import type { OrderRecord } from './orderStore';

/** Accepts a string id, `{ id }`, or `{ public_id }`. */
function idOf(value: unknown): string | undefined {
    if (typeof value === 'string') return value || undefined;
    if (value && typeof value === 'object') {
        const v = value as { id?: unknown; public_id?: unknown };
        if (typeof v.id === 'string') return v.id;
        if (typeof v.public_id === 'string') return v.public_id;
    }
    return undefined;
}

/** The human-readable tracking number, e.g. "FLE4253599245SG". */
export function trackingNumberOf(order?: Partial<OrderRecord> | null): string | undefined {
    if (!order) return undefined;
    const tn = order.tracking_number as unknown;
    if (typeof tn === 'string') return tn || undefined;
    if (tn && typeof tn === 'object') {
        const v = (tn as { tracking_number?: unknown }).tracking_number;
        if (typeof v === 'string') return v || undefined;
    }
    return undefined;
}

/** Identifier to show when there is no tracking number — never "[object Object]". */
export function displayIdOf(order?: Partial<OrderRecord> | null): string {
    return trackingNumberOf(order) ?? (order?.internal_id as string | undefined) ?? String(order?.id ?? '');
}

/** Order config public id, however the API chose to express it. */
export function orderConfigIdOf(order?: Partial<OrderRecord> | null): string | undefined {
    if (!order) return undefined;
    return idOf(order.order_config) ?? idOf((order as { order_config_uuid?: unknown }).order_config_uuid);
}

/** Tracking status code, e.g. "DISPATCHED" — distinct from `order.status`. */
export function trackingStatusCodeOf(order?: Partial<OrderRecord> | null): string | undefined {
    const tn = order?.tracking_number as unknown;
    if (tn && typeof tn === 'object') {
        const code = (tn as { status_code?: unknown }).status_code;
        if (typeof code === 'string') return code;
    }
    return undefined;
}

/** Does this order demand proof before completion? */
export function podRequiredOf(order?: Partial<OrderRecord> | null): boolean {
    return Boolean((order as { pod_required?: unknown } | undefined)?.pod_required);
}

export function customerNameOf(order?: Partial<OrderRecord> | null): string | undefined {
    const c = order?.customer as { name?: unknown } | null | undefined;
    return typeof c?.name === 'string' ? c.name : undefined;
}

export interface PayloadShape {
    pickup?: { name?: string; address?: string };
    dropoff?: { name?: string; address?: string };
    waypoints?: unknown[];
    entities?: unknown[];
    current_waypoint?: string;
}

export function payloadOf(order?: Partial<OrderRecord> | null): PayloadShape {
    return (order?.payload as PayloadShape | undefined) ?? {};
}

/** Entity identifier — same object-or-string problem as the order's. */
export function entityTrackingNumberOf(entity?: Record<string, unknown> | null): string | undefined {
    if (!entity) return undefined;
    const tn = entity.tracking_number;
    if (typeof tn === 'string') return tn || undefined;
    if (tn && typeof tn === 'object') {
        const v = (tn as { tracking_number?: unknown }).tracking_number;
        if (typeof v === 'string') return v || undefined;
    }
    return (entity.sku as string | undefined) ?? undefined;
}

/**
 * Entity identity.
 *
 * A live instance returns `id: null` on **every** entity row — identity lives
 * in `internal_id` ("product_jFpaNGYwZG"). Reading `.id` therefore produced a
 * PUT to `entities/null`, and gating the row's onPress on `.id` made the whole
 * edit screen unreachable. Both were live-only failures: the fixtures had ids.
 */
export function entityIdOf(entity?: Record<string, unknown> | null): string | undefined {
    if (!entity) return undefined;
    return idOf(entity.id) ?? idOf(entity.internal_id) ?? idOf(entity.uuid) ?? idOf(entity.public_id);
}

/** Human label for an entity, falling back through the identifiers. */
export function entityNameOf(entity?: Record<string, unknown> | null): string | undefined {
    const name = entity?.name;
    if (typeof name === 'string' && name.trim()) return name;
    return entityTrackingNumberOf(entity) ?? entityIdOf(entity);
}

/**
 * Has this item been flagged damaged?
 *
 * The column is not part of the public entity payload, so it arrives via
 * `meta` on instances that use it. Checked in both places.
 */
export function entityDamagedOf(entity?: Record<string, unknown> | null): boolean {
    if (!entity) return false;
    if (entity.damaged != null) return Boolean(entity.damaged);
    const meta = entity.meta as Record<string, unknown> | null | undefined;
    return Boolean(meta?.damaged);
}
