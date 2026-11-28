/**
 * Said on the inspection screens when they were opened for a step of an
 * order: which order (its number in full, in mono), and which step the
 * inspection lets it take. Drawn as the order screen draws a step that needs
 * an inspection (design round 3, s27: "NOW · INSPECTION"), so the driver can
 * see it is the same thing.
 */
import { XStack, YStack } from 'tamagui';
import { Body } from '../../ui/Text';
import type { InspectionOrderContext } from '../../data';
import { InspectIcon, useInk } from './parts';

export function InspectionOrderBanner({ order, t, testID = 'inspection-order-banner' }: { order?: InspectionOrderContext | null; t: (key: string, options?: Record<string, unknown>) => string; testID?: string }) {
    const ink = useInk();
    if (!order?.orderId) return null;
    const step = order.activityLabel || order.activityCode;
    const number = order.trackingNumber || order.orderId;
    return (
        <XStack
            alignItems="center"
            gap={12}
            paddingVertical={10}
            paddingHorizontal={12}
            borderRadius={14}
            backgroundColor="$primaryFill"
            borderWidth={1}
            borderColor="$primaryBorder"
            accessible
            accessibilityLabel={t('inspection.forOrder.banner', { order: number, step })}
            testID={testID}
        >
            <YStack width={32} height={32} borderRadius={10} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor="$primary">
                <InspectIcon name="check" size={16} strokeWidth={3} color={ink('onPrimary')} />
            </YStack>
            <YStack flex={1} minWidth={0} gap={1}>
                <Body fontSize={12} lineHeight={16} fontWeight="800" letterSpacing={0.72} textTransform="uppercase" tone="brand" numberOfLines={1}>
                    {t('inspection.forOrder.eyebrow', { step })}
                </Body>
                {/* In full, never cut: it wraps before it is shortened. */}
                <Body fontFamily="$mono" fontSize={15} lineHeight={20} fontWeight="600">
                    {number}
                </Body>
            </YStack>
        </XStack>
    );
}
