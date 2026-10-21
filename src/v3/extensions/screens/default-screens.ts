import type { ScreenLoader, ScreenRegistryDefinition } from './types';

/**
 * Picks one named route screen out of a module, as the `{ default }` module shape
 * the registry loads. The route modules group a tab's screens, so most export
 * several.
 */
const pick =
    <M extends Record<string, any>>(load: () => Promise<M>, name: keyof M & string): ScreenLoader<any> =>
    () =>
        load().then((module) => ({ default: module[name] }));

const today = () => import('../../navigation/routes/today');
const route = () => import('../../navigation/routes/route');
const orders = () => import('../../navigation/routes/orders');
const inbox = () => import('../../navigation/routes/inbox');
const account = () => import('../../navigation/routes/account');
const reports = () => import('../../navigation/routes/reports');
const vehicle = () => import('../../navigation/routes/vehicle');
const inspections = () => import('../../navigation/routes/inspections');

/**
 * The default implementation of every overridable screen. Navigators never import
 * these modules directly — they register `screenSlot(id)` — which is what lets a
 * client build replace a screen without touching the navigator.
 * (__tests__/boundaries.test.ts derives its list of protected modules from here.)
 */
export const defaultScreens: ScreenRegistryDefinition = {
    'today.home': { load: pick(today, 'TodayHome') },
    'navigation.handoff': { load: pick(today, 'NavigationHandoff') },

    'route.home': { load: pick(route, 'RouteHome') },
    'route.stopDetail': { load: pick(route, 'StopDetail') },
    'route.stopExecution': { load: pick(route, 'StopExecution') },
    'route.optimise': { load: pick(route, 'OptimisePreview') },

    'orders.list': { load: pick(orders, 'OrdersHome') },
    'order.detail': { load: pick(orders, 'OrderDetail') },
    'order.entityDetail': { load: pick(orders, 'EntityDetail') },
    'order.editPayloadItem': { load: pick(orders, 'EditPayloadItem') },
    'order.timeline': { load: pick(orders, 'OrderTimeline') },
    'order.proof': { load: pick(orders, 'ProofCapture') },
    'order.destination': { load: pick(orders, 'Destination') },
    'offers.list': { load: pick(orders, 'Offers') },

    'inbox.list': { load: pick(inbox, 'InboxHome') },
    'inbox.conversation': { load: pick(inbox, 'Conversation') },
    'inbox.newConversation': { load: pick(inbox, 'NewConversation') },

    'account.home': { load: pick(account, 'AccountHome') },
    'account.profile': { load: pick(account, 'ProfileEdit') },
    'account.orgSwitcher': { load: pick(account, 'OrgSwitcher') },
    'account.settings': { load: pick(account, 'Settings') },
    'account.help': { load: pick(account, 'Help') },
    'account.syncQueue': { load: pick(account, 'SyncQueue') },
    'account.documents': { load: pick(account, 'Documents') },
    'account.earnings': { load: pick(account, 'Earnings') },

    'fuel.log': { load: pick(reports, 'FuelLog') },
    'fuel.report': { load: pick(reports, 'FuelReport') },
    'fuel.create': { load: pick(reports, 'FuelReportCreate') },
    'issues.list': { load: pick(reports, 'Issues') },
    'issues.detail': { load: pick(reports, 'IssueDetail') },
    'issues.create': { load: pick(reports, 'IssueCreate') },

    'vehicle.mine': { load: pick(vehicle, 'MyVehicle') },
    'vehicle.trailer': { load: pick(vehicle, 'TrailerDetail') },
    'vehicle.change': { load: pick(vehicle, 'ChangeVehicle') },

    'inspection.start': { load: pick(inspections, 'Inspection') },
    'inspection.checklist': { load: pick(inspections, 'InspectionChecklist') },
    'inspection.review': { load: pick(inspections, 'InspectionReview') },
    'inspection.result': { load: pick(inspections, 'InspectionResult') },
    'inspection.detail': { load: pick(inspections, 'InspectionDetail') },
};

/** The route modules behind the defaults, for the navigation boundary test. */
export const DEFAULT_SCREEN_MODULES = ['today', 'route', 'orders', 'inbox', 'account', 'reports', 'vehicle', 'inspections'].map(
    (name) => `navigation/routes/${name}`
);
