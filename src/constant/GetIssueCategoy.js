export default function getIssueCategories(type = null, options) {
    console.log('type;::', JSON.stringify(type));
    const issueCategories = {
        VEHICLE: ['Mechanical Problems', 'Cosmetic Damages', 'Tire Issues', 'Electronics and Instruments', 'Maintenance Alerts', 'Fuel Efficiency Issues'],
        DRIVER: ['Behavior Concerns', 'Documentation', 'Time Management', 'Communication', 'Training Needs', 'Health and Safety Violations'],
        ROUTE: ['Inefficient Routes', 'Safety Concerns', 'Blocked Routes', 'Environmental Considerations', 'Unfavorable Weather Conditions'],
        'payload-cargo': ['Damaged Goods', 'Misplaced Goods', 'Documentation Issues', 'Temperature-Sensitive Goods', 'Incorrect Cargo Loading'],
        'software-technical': ['Bugs', 'UI/UX Concerns', 'Integration Failures', 'Performance', 'Feature Requests', 'Security Vulnerabilities'],
        OPERATIONAL: ['Compliance', 'Resource Allocation', 'Cost Overruns', 'Communication', 'Vendor Management Issues'],
        CUSTOMER: ['Service Quality', 'Billing Discrepancies', 'Communication Breakdown', 'Feedback and Suggestions', 'Order Errors'],
        SECURITY: ['Unauthorized Access', 'Data Concerns', 'Physical Security', 'Data Integrity Issues'],
        'environmental-sustainability': ['Fuel Consumption', 'Carbon Footprint', 'Waste Management', 'Green Initiatives Opportunities'],
    };

    if (type) {
        return issueCategories[type] || [];
    }

    const allIssueCategories = Object.values(issueCategories).flat();
    return allIssueCategories;
}
