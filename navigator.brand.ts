import { defineBranding } from './src/v3/branding/define';

/**
 * Template for a build's branding. Don't customize this file: a client build puts
 * its own at brand/navigator.brand.ts, which is used instead when it exists, so
 * upgrading never conflicts with your changes. See docs/branding.md.
 *
 * Example (brand/navigator.brand.ts):
 *
 *   import { defineBranding } from '../src/v3/branding/define';
 *
 *   export default defineBranding({
 *       schemaVersion: 1,
 *       name: 'Purbeck Couriers',
 *       colors: { primary: '#0FA36B', tokens: { dark: { background: '#08110D' } } },
 *       appearance: { defaultScheme: 'dark', schemes: ['dark', 'light', 'sunlight', 'night'] },
 *       typography: { body: { faces: { '400': 'Inter-Regular', '600': 'Inter-SemiBold', '700': 'Inter-Bold' } } },
 *       navigation: { tabs: ['Today', 'Orders', 'Inbox', 'Account'], defaultTab: 'Orders' },
 *       account: { hiddenLinks: ['FuelLog'] },
 *       features: { earnings: true },
 *       statuses: { awaiting_customs: { tone: 'on_hold', labelKey: 'Brand.status.awaitingCustoms' } },
 *   });
 */
export default defineBranding({ schemaVersion: 1 });
