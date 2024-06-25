const IssueType = {
    VEHICLE: 'Vehicle',
    DRIVER: 'Driver',
    ROUTE: 'Route',
    PAYLOAD_CARGO: 'Payload Cargo',
    SOFTWARE_TECHNICAL: 'Software Technical',
    OPERATIONAL: 'Operational',
    CUSTOMER: 'Customer',
    SECURITY: 'Security',
    ENVIRONMENTAL_SUSTAINABILITY: 'Environmental Sustainability',
};
const IssueCategory = {
    Compliance: 'Compliance',
    ResourceAllocation: 'Resource Allocation',
    CostOverruns: 'Cost Overruns',
    Communication: 'Communication',
    VendorManagementIssue: 'Vendor Management Issue',
};

const IssuePriority = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Critical',
    SCHEDULED_MAINTENANCE: 'Scheduled Maintenance',
    OPERATIONAL_SUGGESTION: 'Operational Suggestion',
};

const Status = {
    Pending: 'Pending',
    InProgress: 'In Progress',
    Backlogged: 'Backlogged',
    RequiresUpdate: 'Requires Update',
    InReview: 'In Review',
    ReOpened: 'Re Opened',
    Duplicate: 'Duplicate',
    PendingReview: 'Pending Review',
    Escalated: 'Escalated',
    Completed: 'Completed',
    Canceled: 'Canceled',
    Pending: 'Pending',
};
export { IssuePriority, IssueType, IssueCategory, Status };
