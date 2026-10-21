import { getBuildExtensions } from './build-extensions';
import { validateCustomNavigation } from './navigation';
import type { AccountMenuLink } from './define';

/**
 * The app's own route names, which a custom route may not take. Kept beside the
 * navigator that registers them; navigation/__tests__ checks the two agree.
 */
export const CORE_ROUTES = [
    'TodayHome',
    'NavigationHandoff',
    'RouteHome',
    'StopDetail',
    'StopExecution',
    'OptimisePreview',
    'OrdersHome',
    'OrderDetail',
    'Offers',
    'EditPayloadItem',
    'EntityDetail',
    'OrderTimeline',
    'ProofCapture',
    'Destination',
    'InboxHome',
    'Conversation',
    'NewConversation',
    'AccountHome',
    'FuelLog',
    'FuelReport',
    'FuelReportCreate',
    'Issues',
    'IssueDetail',
    'IssueCreate',
    'MyVehicle',
    'TrailerDetail',
    'ChangeVehicle',
    'Inspection',
    'InspectionChecklist',
    'InspectionReview',
    'InspectionResult',
    'InspectionDetail',
    'Documents',
    'Earnings',
    'ProfileEdit',
    'Permissions',
    'OrgSwitcher',
    'Settings',
    'Help',
    'SyncQueue',
];

/** The build's custom routes and tabs, validated once. */
export const customNavigation = validateCustomNavigation(getBuildExtensions().routes, getBuildExtensions().tabs, { coreRoutes: CORE_ROUTES });

/** Core routes in the Account stack, which an account menu entry may open. */
const ACCOUNT_ROUTES = CORE_ROUTES.slice(CORE_ROUTES.indexOf('AccountHome'));

/** The build's Account menu entries; an entry whose route the Account stack doesn't have is dropped. */
export const customAccountLinks: AccountMenuLink[] = (getBuildExtensions().accountLinks ?? []).filter((link) => {
    const route = customNavigation.routes[link?.route];
    const reachable = ACCOUNT_ROUTES.includes(link?.route) || (route && (!route.tabs || route.tabs.includes('Account')));
    if (!reachable || typeof link.labelKey !== 'string') {
        const message = `[extensions] Account menu entry "${link?.route}" opens a route the Account stack doesn't have.`;
        if (typeof __DEV__ !== 'undefined' && __DEV__) throw new Error(message);
        console.warn(message);
        return false;
    }
    return true;
});
