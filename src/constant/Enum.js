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
export { IssuePriority, IssueType, IssueCategory };
