/**
 * What an issue can be about, how urgent it is, and when it counts as open.
 *
 * The server stores `type`, `category` and `priority` as free text
 * (CreateIssueRequest only says `nullable`), and no endpoint lists the allowed
 * values. The one authority is the console, which offers fixed lists and
 * filters by them (fleetops `addon/utils/fleet-ops-options.js`: `issueTypes`,
 * `issueCategories`, `issuePriorities`, `issueStatuses`). The values below are
 * those lists, spelled exactly as the console spells them, so an issue filed
 * here shows up under the right type, category and priority there.
 *
 * The app's older list (`src/constants/IssueCategory`) had drifted: it sent
 * `payload_cargo` where the console says `payload-cargo`, `documentation`
 * where it says `driver_documentation`, and so on, and those issues sat outside
 * every console filter.
 *
 * Labels are English defaults; screens read them through
 * `t('me.issue.type.<value>', { defaultValue })` so a translation can replace them.
 */
import type { IssueRecord } from '../../data/useIssues';
import type { IconName } from './parts';

export interface Term {
    value: string;
    label: string;
}

export interface IssueType extends Term {
    icon: IconName;
    /** Shown as a tile; the rest sit behind "Other". */
    primary?: boolean;
}

export const ISSUE_TYPES: IssueType[] = [
    { value: 'vehicle', label: 'Vehicle', icon: 'vehicle', primary: true },
    { value: 'payload-cargo', label: 'Cargo', icon: 'box', primary: true },
    { value: 'route', label: 'Route', icon: 'road', primary: true },
    { value: 'customer', label: 'Customer', icon: 'person' },
    { value: 'driver', label: 'Driver', icon: 'person' },
    { value: 'operational', label: 'Operations', icon: 'check' },
    { value: 'software-technical', label: 'App or device', icon: 'settings' },
    { value: 'security', label: 'Security', icon: 'shield' },
    { value: 'environmental-sustainability', label: 'Environment', icon: 'pin' },
];

export const ISSUE_CATEGORIES: Record<string, Term[]> = {
    vehicle: [
        { value: 'mechanical_problems', label: 'Mechanical problems' },
        { value: 'electrical_faults', label: 'Electrical faults' },
        { value: 'accidents_collisions', label: 'Accidents and collisions' },
        { value: 'cosmetic_damages', label: 'Cosmetic damage' },
        { value: 'tire_issues', label: 'Tyres' },
        { value: 'electronics_instruments', label: 'Electronics and instruments' },
        { value: 'maintenance_alerts', label: 'Maintenance alerts' },
        { value: 'fuel_efficiency', label: 'Fuel efficiency' },
        { value: 'fuel_shortage', label: 'Fuel shortage' },
    ],
    driver: [
        { value: 'behavior_concerns', label: 'Behaviour concerns' },
        { value: 'driver_documentation', label: 'Documentation' },
        { value: 'time_management', label: 'Time management' },
        { value: 'driver_communication', label: 'Communication' },
        { value: 'training_needs', label: 'Training needs' },
        { value: 'health_safety', label: 'Health and safety' },
    ],
    route: [
        { value: 'route_deviation', label: 'Route deviation' },
        { value: 'inefficient_routes', label: 'Inefficient route' },
        { value: 'route_safety', label: 'Safety concerns' },
        { value: 'blocked_routes', label: 'Blocked route' },
        { value: 'unfavorable_weather', label: 'Bad weather' },
        { value: 'environmental_considerations', label: 'Environmental considerations' },
    ],
    'payload-cargo': [
        { value: 'cargo_damage', label: 'Cargo damaged or lost' },
        { value: 'damaged_goods', label: 'Damaged goods' },
        { value: 'misplaced_goods', label: 'Misplaced goods' },
        { value: 'cargo_documentation', label: 'Paperwork problems' },
        { value: 'temperature_sensitive_goods', label: 'Temperature-sensitive goods' },
        { value: 'incorrect_cargo_loading', label: 'Loaded incorrectly' },
    ],
    'software-technical': [
        { value: 'bugs', label: 'Bugs' },
        { value: 'system_outage', label: 'System outage' },
        { value: 'integration_failures', label: 'Integration failures' },
        { value: 'performance', label: 'Performance' },
        { value: 'feature_requests', label: 'Feature requests' },
        { value: 'security_vulnerabilities', label: 'Security vulnerabilities' },
    ],
    operational: [
        { value: 'compliance', label: 'Compliance' },
        { value: 'paperwork_permits', label: 'Paperwork and permits' },
        { value: 'resource_allocation', label: 'Resource allocation' },
        { value: 'cost_overruns', label: 'Cost overruns' },
        { value: 'operational_communication', label: 'Communication' },
        { value: 'vendor_management', label: 'Vendor management' },
    ],
    customer: [
        { value: 'customer_complaint', label: 'Customer complaint' },
        { value: 'service_quality', label: 'Service quality' },
        { value: 'billing_discrepancies', label: 'Billing discrepancies' },
        { value: 'customer_communication', label: 'Communication breakdown' },
        { value: 'order_errors', label: 'Order errors' },
    ],
    security: [
        { value: 'unauthorized_access', label: 'Unauthorised access' },
        { value: 'theft', label: 'Theft or vandalism' },
        { value: 'data_concerns', label: 'Data concerns' },
        { value: 'physical_security', label: 'Physical security' },
        { value: 'data_integrity', label: 'Data integrity' },
    ],
    'environmental-sustainability': [
        { value: 'fuel_consumption', label: 'Fuel consumption' },
        { value: 'carbon_footprint', label: 'Carbon footprint' },
        { value: 'waste_management', label: 'Waste management' },
        { value: 'green_initiatives', label: 'Green initiatives' },
    ],
};

/**
 * The console's severity levels. The mockup words urgency as "Can wait / Today
 * / Stop now", which promises a response time nobody has agreed to; the server
 * knows only these four words, so these are what the driver picks from.
 * (`scheduled_maintenance` and `operational_suggestion` also exist, for issues
 * dispatch plans rather than ones a driver reports.)
 */
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical'];

/** Colour family and mark for a priority — never colour alone. */
export function priorityLook(priority?: string | null): { tone: 'info' | 'warning' | 'danger' | 'neutral'; shape: 'round' | 'diamond' | 'square' } {
    switch (normalizeTerm(priority)) {
        case 'critical':
            return { tone: 'danger', shape: 'square' };
        case 'high':
            return { tone: 'danger', shape: 'diamond' };
        case 'medium':
            return { tone: 'warning', shape: 'diamond' };
        case 'low':
            return { tone: 'info', shape: 'round' };
        default:
            return { tone: 'neutral', shape: 'round' };
    }
}

/** `In Progress`, `in-progress` and `in_progress` are one status. */
export function normalizeTerm(value?: string | null): string {
    return typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s_-]+/g, '_') : '';
}

/**
 * Statuses after which nothing more is expected. The Issue model slugs whatever
 * it is given (`won't fix` is stored as `wont-fix`), hence the normalising.
 * Anything else — including a status this list has never heard of — is open, so
 * an organisation's own vocabulary cannot hide a live issue.
 */
const CLOSED = new Set(['resolved', 'completed', 'closed', 'wont_fix', 'canceled', 'cancelled', 'duplicate']);

export function isOpenIssue(issue?: Pick<IssueRecord, 'status' | 'resolved_at'> | null): boolean {
    if (!issue) return false;
    if (issue.resolved_at) return false;
    return !CLOSED.has(normalizeTerm(issue.status));
}

export function typeOf(value?: string | null): IssueType | undefined {
    const wanted = normalizeTerm(value);
    return ISSUE_TYPES.find((type) => normalizeTerm(type.value) === wanted);
}

/** The label for a stored category, whichever type it sits under. */
export function categoryLabel(value?: string | null): string | undefined {
    const wanted = normalizeTerm(value);
    if (!wanted) return undefined;
    for (const list of Object.values(ISSUE_CATEGORIES)) {
        const hit = list.find((term) => term.value === wanted);
        if (hit) return hit.label;
    }
    return undefined;
}
