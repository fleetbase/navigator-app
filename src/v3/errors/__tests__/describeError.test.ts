import { classifyFailure, describeFailure, serverMessageWorthShowing } from '../describeError';

/**
 * The distinctions here are not HTTP's — they are "what should the driver do".
 * Every screen used to say "Check your connection and try again" regardless,
 * which is actively wrong for most of these.
 */
describe('classifyFailure', () => {
    it('separates having no signal from the server not answering', () => {
        const dropped = { isTransport: true };
        expect(classifyFailure(dropped, false)).toBe('offline');
        expect(classifyFailure(dropped, true)).toBe('unreachable');
    });

    it('recognises an expired session, which needs signing in, not retrying', () => {
        expect(classifyFailure({ status: 401 })).toBe('sessionExpired');
    });

    it('recognises a permission problem, which retrying can never fix', () => {
        expect(classifyFailure({ status: 403 })).toBe('notPermitted');
    });

    it('recognises something that is gone', () => {
        expect(classifyFailure({ status: 404 })).toBe('notFound');
    });

    it('treats validation and conflict as a rejected request', () => {
        expect(classifyFailure({ status: 422 })).toBe('rejected');
        expect(classifyFailure({ status: 409 })).toBe('rejected');
    });

    it('recognises being asked to slow down', () => {
        expect(classifyFailure({ status: 429 })).toBe('rateLimited');
    });

    it('recognises a server fault as not the driver\'s problem', () => {
        expect(classifyFailure({ status: 500 })).toBe('server');
        expect(classifyFailure({ status: 503 })).toBe('server');
    });

    it('recognises an app too old for the server', () => {
        expect(classifyFailure({ status: 410 })).toBe('outdated');
        expect(classifyFailure({ status: 426 })).toBe('outdated');
    });

    it('falls back to unknown rather than guessing', () => {
        expect(classifyFailure(null)).toBe('unknown');
        expect(classifyFailure({})).toBe('unknown');
    });

    it('lets a transport failure win over any status', () => {
        // A dropped request is about the network, whatever else came with it.
        expect(classifyFailure({ isTransport: true, status: 500 }, true)).toBe('unreachable');
    });
});

describe('describeFailure', () => {
    it('offers sign-in for an expired session, not a retry', () => {
        expect(describeFailure({ status: 401 }).action).toBe('signIn');
    });

    it('offers nothing at all where retrying cannot help', () => {
        expect(describeFailure({ status: 403 }).action).toBe('contactDispatch');
        expect(describeFailure({ status: 404 }).action).toBe('none');
        expect(describeFailure({ status: 422 }).action).toBe('none');
    });

    it('offers a retry only where one could actually work', () => {
        for (const status of [429, 500, 503]) {
            expect({ status, action: describeFailure({ status }).action }).toEqual({ status, action: 'retry' });
        }
        expect(describeFailure({ isTransport: true }, false).action).toBe('retry');
    });

    it('marks which failures leave the driver able to carry on', () => {
        expect(describeFailure({ isTransport: true }, false).recoverable).toBe(true);
        expect(describeFailure({ status: 403 }).recoverable).toBe(false);
        expect(describeFailure({ status: 401 }).recoverable).toBe(false);
    });

    it('gives every kind its own wording', () => {
        const kinds = [401, 403, 404, 422, 429, 500, 410].map((status) => describeFailure({ status }));
        const titles = new Set(kinds.map((k) => k.titleKey));
        expect(titles.size).toBe(kinds.length);
    });
});

describe('serverMessageWorthShowing', () => {
    it('shows a validation message, which tells the driver what to fix', () => {
        expect(serverMessageWorthShowing('rejected', 'Location is required')).toBe('Location is required');
    });

    it('never shows the raw message for failures that are not about the request', () => {
        expect(serverMessageWorthShowing('server', 'Internal Server Error')).toBeUndefined();
        expect(serverMessageWorthShowing('offline', 'Network request failed')).toBeUndefined();
    });

    it('suppresses an HTML error page', () => {
        expect(serverMessageWorthShowing('rejected', '<!DOCTYPE html><html>...')).toBeUndefined();
    });

    it('suppresses a transport message that leaked through', () => {
        expect(serverMessageWorthShowing('rejected', 'Network request failed')).toBeUndefined();
    });

    it('suppresses anything too long to read on a phone', () => {
        expect(serverMessageWorthShowing('rejected', 'x'.repeat(201))).toBeUndefined();
    });

    it('suppresses an empty message', () => {
        expect(serverMessageWorthShowing('rejected', '   ')).toBeUndefined();
        expect(serverMessageWorthShowing('rejected', undefined)).toBeUndefined();
    });
});
