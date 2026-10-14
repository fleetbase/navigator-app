/**
 * Is this order finished? Asked of the order's own config first.
 *
 * Three screens and the store each carried their own hard-coded set of
 * "finished" status names, and they disagreed (`order_completed` was in two of
 * them). Worse, a config may end its flow in any code it likes — a service
 * booking ends `completed`, but a bespoke flow can end `handed_over` or
 * `job_done` — and a list of names cannot know that. The config can: the
 * activity a flow ends on carries `complete: true`.
 *
 * So: the config's flag when the config is loaded and names the status;
 * otherwise the union of the old sets, which is what every screen did before.
 * Cancellation and failure are terminal whatever the config says — they are not
 * steps in a flow, they are the flow being abandoned.
 */
import type { FlowActivity } from './activityFlow';
import type { OrderRecord } from './orderStore';
import { cachedOrderConfig } from './orderConfigCache';

/** Abandoned rather than completed — terminal under any config. */
const ABANDONED = new Set(['canceled', 'cancelled', 'order_canceled', 'order_cancelled', 'failed', 'expired']);

/** The pre-config fallback: every name any screen used to treat as done. */
const FINISHED_FALLBACK = new Set(['completed', 'order_completed', ...ABANDONED]);

function configIdOf(order?: Partial<OrderRecord> | null): string | undefined {
    const value = order?.order_config as unknown;
    if (typeof value === 'string') return value || undefined;
    if (value && typeof value === 'object') {
        const v = value as { id?: unknown; public_id?: unknown };
        if (typeof v.id === 'string') return v.id;
        if (typeof v.public_id === 'string') return v.public_id;
    }
    return undefined;
}

/**
 * Whether `status` ends the order. `flow` is the order's config flow when the
 * caller has it; without one (or when the flow does not name the status) the
 * fallback set decides.
 */
export function isFinishedStatus(status?: string | null, flow?: FlowActivity[] | null): boolean {
    const code = String(status ?? '').toLowerCase();
    if (!code) return false;
    if (ABANDONED.has(code)) return true;
    const activity = flow?.find((a) => String(a.code).toLowerCase() === code);
    if (activity) return Boolean(activity.complete);
    return FINISHED_FALLBACK.has(code);
}

/** As above, reading the order's config from the session cache. */
export function isOrderFinished(order?: Pick<OrderRecord, 'status'> | Partial<OrderRecord> | null): boolean {
    if (!order) return false;
    const flow = cachedOrderConfig(configIdOf(order as Partial<OrderRecord>))?.flow;
    return isFinishedStatus(order.status, flow);
}

/** Abandoned (canceled / failed / expired), as opposed to completed. */
export function isOrderAbandoned(order?: Pick<OrderRecord, 'status'> | null): boolean {
    return ABANDONED.has(String(order?.status ?? '').toLowerCase());
}
