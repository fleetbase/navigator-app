import type { ScreenId } from './screen-ids';
import type { Destination } from '../../navigate/handoff';
import type {
    ChatChannelRecord,
    FuelReportRecord,
    InspectionFormRecord,
    InspectionSubmissionRecord,
    IssueRecord,
    TrailerRecord,
} from '../../data';

type None = Record<string, never> | undefined;

type InspectionRouteParams = { formId?: string; vehicleId?: string; vehicleName?: string; form?: InspectionFormRecord; afterSwap?: boolean };

/**
 * Route params per screen id. Part of the public contract: an override reads
 * `route.params` through this map, so changing a field here is a breaking change
 * for client builds and belongs in the release notes.
 */
export type ScreenParamMap = {
    'today.home': None;
    'navigation.handoff': { destination?: Destination; orderId?: string };
    'route.home': None;
    'route.stopDetail': { manifestId?: string; stopId?: string };
    'route.stopExecution': { manifestId?: string; stopId?: string };
    'route.optimise': { manifestId?: string };
    'orders.list': None;
    'order.detail': { orderId?: string };
    'order.entityDetail': { orderId?: string; entityId?: string; entity?: Record<string, unknown> };
    'order.editPayloadItem': { orderId?: string; entity?: { id: string } };
    'order.timeline': { orderId?: string };
    'order.proof': { orderId?: string; activityCode?: string; activityLabel?: string; podMethod?: string | null; expected?: string[] };
    'order.destination': { orderId?: string };
    'offers.list': None;
    'inbox.list': None;
    'inbox.conversation': { channel?: ChatChannelRecord; channelId?: string };
    'inbox.newConversation': None;
    'account.home': None;
    'account.profile': None;
    'account.orgSwitcher': None;
    'account.settings': None;
    'account.help': None;
    'account.syncQueue': None;
    'account.documents': None;
    'account.earnings': None;
    'fuel.log': None;
    'fuel.report': { report?: FuelReportRecord; previous?: FuelReportRecord };
    'fuel.create': { last?: FuelReportRecord; currency?: string };
    'issues.list': None;
    'issues.detail': { issue?: IssueRecord };
    'issues.create': None;
    'vehicle.mine': None;
    'vehicle.trailer': { trailerId?: string; trailer?: TrailerRecord };
    'vehicle.change': { currentVehicleId?: string };
    'inspection.start': InspectionRouteParams;
    'inspection.checklist': InspectionRouteParams;
    'inspection.review': InspectionRouteParams;
    'inspection.result': { submission?: InspectionSubmissionRecord; vehicleName?: string; unsafe?: boolean };
    'inspection.detail': { submissionId?: string; submission?: InspectionSubmissionRecord };
};

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Fails to compile when a screen id has no params entry, or an entry has no id. */
export const PARAM_MAP_COVERS_ALL_SCREENS: Exact<keyof ScreenParamMap, ScreenId> = true;
