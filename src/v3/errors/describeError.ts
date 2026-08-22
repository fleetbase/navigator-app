/**
 * One place that turns a failure into words — gap I2.
 *
 * Every screen was telling the driver "Check your connection and try again",
 * whatever had actually gone wrong. That is fine for a dropped request and
 * actively misleading for the rest: a driver told to check their connection
 * after a 403 will retry something that can never succeed, and one told it after
 * a 401 will not do the one thing that would fix it.
 *
 * The distinctions that matter to a driver are not HTTP's. They are:
 *
 *   - can I fix this by moving somewhere with signal?
 *   - do I need to sign in again?
 *   - is this something only dispatch can unblock?
 *   - is retrying pointless?
 *
 * so the kinds below are grouped by *what the driver should do*, and the action
 * is part of the description rather than left to each screen to guess.
 */

export type FailureKind =
    | 'offline'
    | 'unreachable'
    | 'sessionExpired'
    | 'notPermitted'
    | 'notFound'
    | 'rejected'
    | 'rateLimited'
    | 'server'
    | 'outdated'
    | 'unknown';

/** What the screen should offer. `none` means retrying cannot help. */
export type FailureAction = 'retry' | 'signIn' | 'contactDispatch' | 'update' | 'none';

export interface FailureDescription {
    kind: FailureKind;
    titleKey: string;
    bodyKey: string;
    action: FailureAction;
    /** True when the driver's own work is unaffected and can continue. */
    recoverable: boolean;
}

export interface FailureLike {
    status?: number;
    isTransport?: boolean;
    message?: string;
}

const DESCRIPTIONS: Record<FailureKind, Omit<FailureDescription, 'kind'>> = {
    offline: { titleKey: 'failure.offline.title', bodyKey: 'failure.offline.body', action: 'retry', recoverable: true },
    unreachable: { titleKey: 'failure.unreachable.title', bodyKey: 'failure.unreachable.body', action: 'retry', recoverable: true },
    sessionExpired: { titleKey: 'failure.sessionExpired.title', bodyKey: 'failure.sessionExpired.body', action: 'signIn', recoverable: false },
    notPermitted: { titleKey: 'failure.notPermitted.title', bodyKey: 'failure.notPermitted.body', action: 'contactDispatch', recoverable: false },
    notFound: { titleKey: 'failure.notFound.title', bodyKey: 'failure.notFound.body', action: 'none', recoverable: false },
    rejected: { titleKey: 'failure.rejected.title', bodyKey: 'failure.rejected.body', action: 'none', recoverable: false },
    rateLimited: { titleKey: 'failure.rateLimited.title', bodyKey: 'failure.rateLimited.body', action: 'retry', recoverable: true },
    server: { titleKey: 'failure.server.title', bodyKey: 'failure.server.body', action: 'retry', recoverable: true },
    outdated: { titleKey: 'failure.outdated.title', bodyKey: 'failure.outdated.body', action: 'update', recoverable: false },
    unknown: { titleKey: 'failure.unknown.title', bodyKey: 'failure.unknown.body', action: 'retry', recoverable: true },
};

export function classifyFailure(error?: FailureLike | null, isOnline = true): FailureKind {
    if (!error) return 'unknown';

    // A dropped request while the device knows it has no signal is not a
    // server problem, and saying so stops the driver blaming the app.
    if (error.isTransport) return isOnline ? 'unreachable' : 'offline';

    const status = error.status;
    if (typeof status !== 'number') return 'unknown';

    if (status === 401) return 'sessionExpired';
    if (status === 403) return 'notPermitted';
    if (status === 404) return 'notFound';
    if (status === 409 || status === 422) return 'rejected';
    if (status === 429) return 'rateLimited';
    // 410 Gone / 426 Upgrade Required are how a server tells an old client to stop.
    if (status === 410 || status === 426) return 'outdated';
    if (status >= 500) return 'server';
    if (status >= 400) return 'rejected';

    return 'unknown';
}

export function describeFailure(error?: FailureLike | null, isOnline = true): FailureDescription {
    const kind = classifyFailure(error, isOnline);
    return { kind, ...DESCRIPTIONS[kind] };
}

/**
 * Whether the server's own message is worth showing.
 *
 * A validation message ("Location is required") tells the driver something
 * useful. A stack trace, an HTML error page, or "Network request failed" tells
 * them nothing and looks broken.
 */
export function serverMessageWorthShowing(kind: FailureKind, message?: string): string | undefined {
    if (kind !== 'rejected') return undefined;
    const trimmed = (message ?? '').trim();
    if (!trimmed || trimmed.length > 200) return undefined;
    if (/^</.test(trimmed)) return undefined;
    if (/network request failed/i.test(trimmed)) return undefined;
    return trimmed;
}
