/**
 * The one way this app tells a driver something failed — gap I2.
 *
 * Screens used to hand `ErrorState` their own copy, which is how ten of them
 * ended up saying "Check your connection and try again" for every failure
 * including the ones where connection had nothing to do with it. This takes the
 * error itself and works out both the wording and the recovery.
 */
import { YStack } from 'tamagui';
import { Micro } from './Text';
import { ErrorState } from './Banner';
import { space } from '../theme/tokens';
import { describeFailure, serverMessageWorthShowing, type FailureLike } from '../errors/describeError';

export interface FailureStateProps {
    error?: FailureLike | null;
    isOnline?: boolean;
    /** Wired to whichever recovery the failure actually calls for. */
    onRetry?: () => void;
    onSignIn?: () => void;
    onUpdate?: () => void;
    t: (key: string, options?: Record<string, unknown>) => string;
    testID?: string;
}

export function FailureState({ error, isOnline = true, onRetry, onSignIn, onUpdate, t, testID }: FailureStateProps) {
    const failure = describeFailure(error, isOnline);
    const detail = serverMessageWorthShowing(failure.kind, error?.message);

    // Retrying a 403 or a 404 cannot help, so no button is offered for them —
    // a dead Retry teaches drivers to distrust the ones that do work.
    const handler =
        failure.action === 'retry'
            ? onRetry
            : failure.action === 'signIn'
              ? onSignIn
              : failure.action === 'update'
                ? onUpdate
                : undefined;

    const actionLabelKey =
        failure.action === 'signIn'
            ? 'failure.action.signIn'
            : failure.action === 'update'
              ? 'failure.action.update'
              : 'failure.action.retry';

    return (
        <YStack gap={space[2]} testID={testID ?? `failure-${failure.kind}`}>
            <ErrorState
                title={t(failure.titleKey)}
                body={t(failure.bodyKey)}
                onRetry={handler}
                retryLabel={handler ? t(actionLabelKey) : undefined}
                testID={`failure-body-${failure.kind}`}
            />
            {/* The server's own words, but only when they say something useful. */}
            {detail ? <Micro testID="failure-detail">{detail}</Micro> : null}
            {failure.action === 'contactDispatch' ? (
                <Micro tone="warning" testID="failure-contact">
                    {t('failure.action.contactDispatch')}
                </Micro>
            ) : null}
        </YStack>
    );
}

export default FailureState;
