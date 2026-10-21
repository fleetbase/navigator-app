/**
 * Stable screen ids — the public contract a client build overrides screens by.
 *
 * React Navigation route names may change; these must not. A rename breaks every
 * client build that overrides the screen, so add a new id instead.
 *
 * Not here, on purpose: the permissions primer (it carries the store-mandated
 * background-location disclosure) and the pre-auth flow, which is not routed —
 * the sign-in screen is a component slot (`auth.signIn`, see components/).
 */
export const SCREEN_IDS = [
    // Today
    'today.home',
    'navigation.handoff',
    // Route
    'route.home',
    'route.stopDetail',
    'route.stopExecution',
    'route.optimise',
    // Orders
    'orders.list',
    'order.detail',
    'order.entityDetail',
    'order.editPayloadItem',
    'order.timeline',
    'order.proof',
    'order.destination',
    'offers.list',
    // Inbox
    'inbox.list',
    'inbox.conversation',
    'inbox.newConversation',
    // Account
    'account.home',
    'account.profile',
    'account.orgSwitcher',
    'account.settings',
    'account.help',
    'account.syncQueue',
    'account.documents',
    'account.earnings',
    // Reports
    'fuel.log',
    'fuel.report',
    'fuel.create',
    'issues.list',
    'issues.detail',
    'issues.create',
    // Vehicle
    'vehicle.mine',
    'vehicle.trailer',
    'vehicle.change',
    // Inspections
    'inspection.start',
    'inspection.checklist',
    'inspection.review',
    'inspection.result',
    'inspection.detail',
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];

const ids = new Set<string>(SCREEN_IDS);

export function isScreenId(value: unknown): value is ScreenId {
    return typeof value === 'string' && ids.has(value);
}
