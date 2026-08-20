/**
 * Banners and states.
 *
 * The design treats offline as a first-class state, not an error — so the
 * offline banner is calm (neutral surface, amber dot, queued count) while
 * failures are loud. v2 had no documented empty/error/offline set at all and
 * each screen improvised; these are the documented ones.
 */
import { XStack, YStack, styled } from 'tamagui';
import { Body, Micro, Secondary } from './Text';
import { Button } from './Button';
import { radius, space } from '../theme/tokens';

const Frame = styled(XStack, {
    name: 'Banner',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radius.compact + 2,
    borderWidth: 1,

    variants: {
        tone: {
            neutral: { backgroundColor: '$surfaceRaised', borderColor: '$border' },
            success: { backgroundColor: '$successFill', borderColor: '$successBorder' },
            warning: { backgroundColor: '$warningFill', borderColor: '$warningBorder' },
            danger: { backgroundColor: '$dangerFill', borderColor: '$dangerBorder' },
            brand: { backgroundColor: '$primaryFill', borderColor: '$primaryBorder' },
        },
    } as const,

    defaultVariants: { tone: 'neutral' },
});

const Dot = styled(YStack, { name: 'BannerDot', width: 8, height: 8, borderRadius: 999 });

export type BannerTone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand';

export interface BannerProps {
    tone?: BannerTone;
    message: string;
    /** Right-aligned meta, e.g. a queued count or a countdown. */
    meta?: string;
    action?: { label: string; onPress: () => void };
    testID?: string;
}

const dotColor: Record<BannerTone, string> = {
    neutral: '$warning',
    success: '$successText',
    warning: '$warningText',
    danger: '$dangerText',
    brand: '$primary',
};

const textTone: Record<BannerTone, 'primary' | 'success' | 'warning' | 'danger' | 'brand'> = {
    neutral: 'primary',
    success: 'success',
    warning: 'warning',
    danger: 'danger',
    brand: 'brand',
};

export function Banner({ tone = 'neutral', message, meta, action, testID }: BannerProps) {
    return (
        <Frame tone={tone} testID={testID} accessibilityRole="alert">
            <Dot backgroundColor={dotColor[tone] as any} />
            <Body flex={1} tone={textTone[tone]} fontWeight="600">
                {message}
            </Body>
            {meta ? (
                <Micro tone={textTone[tone]} tabular>
                    {meta}
                </Micro>
            ) : null}
            {action ? (
                <Button variant={tone === 'danger' ? 'destructive' : 'secondary'} height={34} paddingHorizontal={space[3]} onPress={action.onPress}>
                    {action.label}
                </Button>
            ) : null}
        </Frame>
    );
}

/**
 * The offline banner. Deliberately neutral: losing signal is expected in a
 * basement or a loading dock, and alarming the driver about it is wrong.
 */
export function OfflineBanner({ queued }: { queued: number }) {
    return (
        <Banner
            tone="neutral"
            message="You're offline — work is saved on device"
            meta={queued > 0 ? `${queued} queued` : undefined}
            testID="offline-banner"
        />
    );
}

export function SyncedBanner({ count }: { count: number }) {
    return <Banner tone="success" message={`Back online — ${count} ${count === 1 ? 'action' : 'actions'} synced`} testID="synced-banner" />;
}

export function EmptyState({
    title,
    body,
    action,
    testID,
}: {
    title: string;
    body?: string;
    action?: { label: string; onPress: () => void };
    testID?: string;
}) {
    return (
        <YStack
            testID={testID}
            alignItems="center"
            gap={space[2]}
            padding={space[5]}
            borderRadius={radius.hero}
            borderWidth={1}
            borderColor="$border"
            borderStyle="dashed"
            backgroundColor="$background"
        >
            <Body fontWeight="700" center>
                {title}
            </Body>
            {body ? <Secondary center>{body}</Secondary> : null}
            {action ? (
                <Button marginTop={space[2]} paddingHorizontal={space[5]} onPress={action.onPress}>
                    {action.label}
                </Button>
            ) : null}
        </YStack>
    );
}

export function ErrorState({
    title,
    body,
    onRetry,
    /**
     * Required when onRetry is set. The component library carries no copy of
     * its own — callers pass translated strings so nothing here needs a
     * translator's attention.
     */
    retryLabel,
    testID,
}: {
    title: string;
    body?: string;
    onRetry?: () => void;
    retryLabel?: string;
    testID?: string;
}) {
    return (
        <YStack testID={testID} alignItems="center" gap={space[2]} padding={space[5]}>
            <Body fontWeight="700" tone="danger" center>
                {title}
            </Body>
            {body ? <Secondary center>{body}</Secondary> : null}
            {onRetry && retryLabel ? (
                <Button variant="secondary" marginTop={space[2]} onPress={onRetry}>
                    {retryLabel}
                </Button>
            ) : null}
        </YStack>
    );
}

/** Shimmer-less skeleton block — cheap, and no animation to burn battery. */
export const Skeleton = styled(YStack, {
    name: 'Skeleton',
    backgroundColor: '$surfaceRaised',
    borderRadius: radius.compact,
    opacity: 0.6,
});

export default Banner;
