/**
 * Stable component ids — the components a client build may replace.
 *
 * Deliberately a short list: the parts of the app a white-label build most often
 * wants to make its own. Each id is a public contract (its props are in
 * types.ts); add an id rather than renaming one. Everything else is customised
 * through branding, or by overriding the screen that renders it.
 */
export const COMPONENT_IDS = [
    /** The sign-in screen (pre-auth; not routed, so it is a component rather than a screen). */
    'auth.signIn',
    /** The header above every tab: organisation mark, name and duty control. */
    'shell.appHeader',
    /** The bottom tab bar. */
    'shell.tabBar',
    /** An order in the Orders and Today lists. */
    'orders.orderCard',
    /** A stop in a route manifest. */
    'route.stopRow',
] as const;

export type ComponentId = (typeof COMPONENT_IDS)[number];

const ids = new Set<string>(COMPONENT_IDS);

export function isComponentId(value: unknown): value is ComponentId {
    return typeof value === 'string' && ids.has(value);
}
