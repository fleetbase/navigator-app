export const VEHICLE = Object.freeze(['Mechanical Problems', 'Cosmetic Damages', 'Tire Issues', 'Electronics and Instruments', 'Maintenance Alerts', 'Fuel Efficiency Issues']);
export const DRIVER = Object.freeze(['Behavior Concerns', 'Documentation', 'Time Management', 'Communication', 'Training Needs', 'Health and Safety Violations']);
export const ROUTE = Object.freeze(['Inefficient Routes', 'Safety Concerns', 'Blocked Routes', 'Environmental Considerations', 'Unfavorable Weather Conditions']);
export const PAYLOAD_CARGO = Object.freeze(['Damaged Goods', 'Misplaced Goods', 'Documentation Issues', 'Temperature-Sensitive Goods', 'Incorrect Cargo Loading']);
export const SOFTWARE_TECHNICAL = Object.freeze(['Bugs', 'UI/UX Concerns', 'Integration Failures', 'Performance', 'Feature Requests', 'Security Vulnerabilities']);
export const OPERATIONAL = Object.freeze(['Compliance', 'Resource Allocation', 'Cost Overruns', 'Communication', 'Vendor Management Issues']);
export const CUSTOMER = Object.freeze(['Service Quality', 'Billing Discrepancies', 'Communication Breakdown', 'Feedback and Suggestions', 'Order Errors']);
export const SECURITY = Object.freeze(['Unauthorized Access', 'Data Concerns', 'Physical Security', 'Data Integrity Issues']);
export const ENVIRONMENTAL_SUSTAINABILITY = Object.freeze(['Fuel Consumption', 'Carbon Footprint', 'Waste Management', 'Green Initiatives Opportunities']);

export const IssueCategory = Object.freeze({
    VEHICLE,
    DRIVER,
    ROUTE,
    PAYLOAD_CARGO,
    SOFTWARE_TECHNICAL,
    OPERATIONAL,
    CUSTOMER,
    SECURITY,
    ENVIRONMENTAL_SUSTAINABILITY,
    all: () => [...VEHICLE, ...DRIVER, ...ROUTE, ...PAYLOAD_CARGO, ...SOFTWARE_TECHNICAL, ...OPERATIONAL, ...CUSTOMER, ...SECURITY, ...ENVIRONMENTAL_SUSTAINABILITY],
});

export function getIssueCategories(type) {
    return IssueCategory[type] ?? [];
}

export default IssueCategory;
