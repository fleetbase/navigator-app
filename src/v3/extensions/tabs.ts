/** The five tabs the app ships, in their designed order. Pure data: branding imports it. */
export const CORE_TABS = ['Today', 'Route', 'Orders', 'Inbox', 'Account'] as const;
export type CoreTab = (typeof CORE_TABS)[number];

/** Custom tab names: PascalCase, ending in `Tab`, so they never collide with a core tab. */
export const CUSTOM_TAB_NAME = /^[A-Z][A-Za-z0-9]{0,44}Tab$/;
