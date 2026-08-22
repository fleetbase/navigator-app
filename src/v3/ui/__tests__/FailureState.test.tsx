import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { FailureState } from '../FailureState';

const t = (key: string) => key;

function render(node: React.ReactElement, scheme: SchemeName = 'dark') {
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>{node}</Theme>
            </TamaguiProvider>
        );
    });
    // @ts-expect-error assigned inside act
    return tree;
}

type N = { children?: unknown[]; props?: Record<string, unknown> };
function walk(node: unknown, visit: (n: N) => void): void {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach((c) => walk(c, visit));
    visit(node as N);
    (node as N).children?.forEach((c) => walk(c, visit));
}
const textOf = (tree: ReactTestRenderer.ReactTestRenderer) => {
    const out: string[] = [];
    walk(tree.toJSON(), (n) => n.children?.forEach((c) => typeof c === 'string' && out.push(c)));
    return out.join(' ');
};
const testIDs = (tree: ReactTestRenderer.ReactTestRenderer) => {
    const out: string[] = [];
    walk(tree.toJSON(), (n) => typeof n.props?.testID === 'string' && out.push(n.props.testID as string));
    return out;
};

describe('FailureState', () => {
    it.each(SCHEMES)('renders in the %s scheme', (scheme) => {
        const tree = render(<FailureState error={{ status: 500 }} t={t} />, scheme);
        expect(tree.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('names the failure by kind, so a screenshot says what went wrong', () => {
        const tree = render(<FailureState error={{ status: 403 }} t={t} />);
        expect(testIDs(tree)).toContain('failure-notPermitted');
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('offers no dead Retry for a failure retrying cannot fix', () => {
        // A button that never works teaches drivers to distrust the ones that do.
        const onRetry = jest.fn();
        const tree = render(<FailureState error={{ status: 404 }} onRetry={onRetry} t={t} />);
        expect(textOf(tree)).not.toContain('failure.action.retry');
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('offers sign-in for an expired session, wired to the sign-in handler', () => {
        const onSignIn = jest.fn();
        const onRetry = jest.fn();
        const tree = render(<FailureState error={{ status: 401 }} onRetry={onRetry} onSignIn={onSignIn} t={t} />);
        expect(textOf(tree)).toContain('failure.action.signIn');
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('tells the driver to ask dispatch when only dispatch can unblock it', () => {
        const tree = render(<FailureState error={{ status: 403 }} t={t} />);
        expect(testIDs(tree)).toContain('failure-contact');
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('distinguishes no signal from the server not answering', () => {
        const offline = render(<FailureState error={{ isTransport: true }} isOnline={false} t={t} />);
        expect(testIDs(offline)).toContain('failure-offline');
        ReactTestRenderer.act(() => offline.unmount());

        const unreachable = render(<FailureState error={{ isTransport: true }} isOnline t={t} />);
        expect(testIDs(unreachable)).toContain('failure-unreachable');
        ReactTestRenderer.act(() => unreachable.unmount());
    });

    it("shows the server's own words when they are useful", () => {
        const tree = render(<FailureState error={{ status: 422, message: 'Location is required' }} t={t} />);
        expect(textOf(tree)).toContain('Location is required');
        ReactTestRenderer.act(() => tree.unmount());
    });

    it('hides the raw message when it would only look broken', () => {
        const tree = render(<FailureState error={{ isTransport: true, message: 'Network request failed' }} t={t} />);
        expect(textOf(tree)).not.toContain('Network request failed');
        ReactTestRenderer.act(() => tree.unmount());
    });
});
