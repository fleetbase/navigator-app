export * from './IssueCategory';

export const IssueType = Object.freeze({
    VEHICLE: 'Vehicle',
    DRIVER: 'Driver',
    ROUTE: 'Route',
    PAYLOAD_CARGO: 'Payload Cargo',
    SOFTWARE_TECHNICAL: 'Software Technical',
    OPERATIONAL: 'Operational',
    CUSTOMER: 'Customer',
    SECURITY: 'Security',
    ENVIRONMENTAL_SUSTAINABILITY: 'Environmental Sustainability',
});

export const IssuePriority = Object.freeze({
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Critical',
    SCHEDULED_MAINTENANCE: 'Scheduled Maintenance',
    OPERATIONAL_SUGGESTION: 'Operational Suggestion',
});

export const IssueStatus = Object.freeze({
    PENDING: 'Pending',
    IN_PROGRESS: 'In Progress',
    BACKLOGGED: 'Backlogged',
    REQUIRES_UPDATE: 'Requires Update',
    IN_REVIEW: 'In Review',
    RE_OPENED: 'Re Opened',
    DUPLICATE: 'Duplicate',
    PENDING_REVIEW: 'Pending Review',
    ESCALATED: 'Escalated',
    COMPLETED: 'Completed',
    CANCELED: 'Canceled',
});

export const FuelReportStatus = Object.freeze({
    DRAFT: 'Draft',
    PENDING_APPROVAL: 'Pending Approval',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    REVISED: 'Revised',
    SUBMITTED: 'Submitted',
    IN_REVIEW: 'In Review',
    CONFIRMED: 'Confirmed',
    ARCHIVED: 'Archived',
    CANCELED: 'Canceled',
});

export const DriverFuelReportStatus = Object.freeze({
    DRAFT: 'Draft',
    REVISED: 'Revised',
    SUBMITTED: 'Submitted',
    ARCHIVED: 'Archived',
    CANCELED: 'Canceled',
});

function convertEnumToArray(enumObj) {
    return Object.entries(enumObj).map(([key, value]) => ({ key, value }));
}

export function getIssueTypes() {
    return convertEnumToArray(IssueType);
}

export function getIssuePriorities() {
    return convertEnumToArray(IssuePriority);
}

export function getIssueStatuses() {
    return convertEnumToArray(IssueStatus);
}

export function getFuelReportStatuses() {
    return convertEnumToArray(FuelReportStatus);
}

export function getDriverFuelReportStatuses() {
    return convertEnumToArray(DriverFuelReportStatus);
}
