import { defineNavigatorExtensions } from './src/v3/extensions/define';

/**
 * Template for a build's extensions. Don't customize this file: a client build puts
 * its own at brand/navigator.extensions.ts, which is used instead when it exists, so
 * upgrading never conflicts with your changes. See docs/extensibility.md.
 *
 * Example (brand/navigator.extensions.ts):
 *
 *   import { defineNavigatorExtensions } from '../src/v3/extensions/define';
 *   import { RewardsIcon } from './icons';
 *
 *   export default defineNavigatorExtensions({
 *       schemaVersion: 1,
 *       screens: { 'order.detail': { load: () => import('./screens/OrderDetail') } },
 *       components: { 'orders.orderCard': { load: () => import('./components/OrderCard') } },
 *       routes: { Rewards: { load: () => import('./screens/Rewards'), titleKey: 'Brand.rewards' } },
 *       tabs: { RewardsTab: { initialRoute: 'Rewards', icon: RewardsIcon, labelKey: 'Brand.rewardsTab' } },
 *   });
 */
export default defineNavigatorExtensions({ schemaVersion: 1 });
