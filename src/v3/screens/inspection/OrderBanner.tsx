/**
 * Said at the top of the inspection screens when they were opened for a step
 * of an order: which order, and which step the inspection lets it take.
 */
import { Banner } from '../../ui/Banner';
import type { InspectionOrderContext } from '../../data';

export function InspectionOrderBanner({ order, t, testID = 'inspection-order-banner' }: { order?: InspectionOrderContext | null; t: (key: string, options?: Record<string, unknown>) => string; testID?: string }) {
    if (!order?.orderId) return null;
    return (
        <Banner
            tone="brand"
            message={t('inspection.forOrder.banner', { order: order.trackingNumber || order.orderId, step: order.activityLabel || order.activityCode })}
            testID={testID}
        />
    );
}
