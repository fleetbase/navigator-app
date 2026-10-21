/**
 * Compile-time checks of the public extension types (run by `yarn typecheck`).
 * Each `@ts-expect-error` fails the typecheck if the line it guards ever compiles.
 */
import { defineNavigatorExtensions } from '../define';
import { defineBranding } from '../../branding/define';
import type { NavigatorScreen } from '../screens/types';
import type { NavigatorComponent } from '../components/types';
import type { ScreenParamMap } from '../screens/params';

const OrderDetail: NavigatorScreen<'order.detail'> = ({ route, DefaultScreen, ...rest }) => {
    const orderId: string | undefined = route.params?.orderId;
    void orderId;
    return <DefaultScreen route={route} {...rest} />;
};

const OrderCard: NavigatorComponent<'orders.orderCard'> = ({ Default, ...props }) => {
    const tracking: string = props.trackingNumber;
    void tracking;
    return <Default {...props} />;
};

defineNavigatorExtensions({
    schemaVersion: 1,
    screens: { 'order.detail': { load: () => Promise.resolve({ default: OrderDetail }) } },
    components: { 'orders.orderCard': { load: () => Promise.resolve({ default: OrderCard }) } },
    routes: { Rewards: { load: () => Promise.resolve({ default: () => null }), tabs: ['Account'], titleKey: 'Brand.rewards' } },
    tabs: { RewardsTab: { initialRoute: 'Rewards', icon: () => null } },
    accountLinks: [{ route: 'Rewards', labelKey: 'Brand.rewards' }],
});

defineNavigatorExtensions({
    // @ts-expect-error unknown screen id
    screens: { 'order.nope': { load: () => Promise.resolve({ default: OrderDetail }) } },
});

defineNavigatorExtensions({
    // @ts-expect-error an entry needs a loader, not a component
    components: { 'route.stopRow': { component: OrderCard } },
});

// @ts-expect-error platforms are ios and android
defineNavigatorExtensions({ screens: { 'order.detail': { load: () => Promise.resolve({ default: OrderDetail }), platforms: ['web'] } } });

// @ts-expect-error order.detail params carry an orderId, not a storeId
const params: ScreenParamMap['order.detail'] = { storeId: 'x' };
void params;

defineBranding({ schemaVersion: 1, colors: { preset: 'green', tokens: { dark: { background: '#000000' } } }, navigation: { tabs: ['Today', 'Account'] } });

// @ts-expect-error schemaVersion is required
defineBranding({ colors: { preset: 'green' } });

it('type-checks (see yarn typecheck)', () => {
    expect(true).toBe(true);
});
