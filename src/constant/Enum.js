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
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
    'scheduled-maintenance': 'Scheduled Maintenance',
    'operational-suggestion': 'Operational Suggestion',
};

const Status = {
    pending: 'Pending',
    'in-progress': 'In Progress',
    backlogged: 'Backlogged',
    'requires-update': 'Requires Update',
    'in-review': 'In Review',
    're-opened': 'Re Opened',
    duplicate: 'Duplicate',
    'pending-review': 'Pending Review',
    escalated: 'Escalated',
    completed: 'Completed',
    canceled: 'Canceled',
};

export { IssuePriority, IssueType, IssueCategory, Status };
