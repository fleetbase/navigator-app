/**
 * Pushed screens must say where you are and offer a way out.
 *
 * The stack declared `headerShown: false` for every route, so the only way back
 * from a fuel report or the sync queue was the iOS edge-swipe — invisible, and
 * not something you find with gloves on in the rain.
 */
import * as ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config from '../../theme';
import { ScreenHeader } from '../ScreenHeader';

const render = (node: React.ReactElement) => {
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme="light">
                <Theme name="light">{node}</Theme>
            </TamaguiProvider>
        );
    });
    // @ts-expect-error assigned inside act
    return tree;
};

type N = { children?: unknown[]; props?: Record<string, unknown> };
function walk(node: unknown, visit: (n: N) => void): void {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach((c) => walk(c, visit));
    visit(node as N);
    (node as N).children?.forEach((c) => walk(c, visit));
}
const idsOf = (t: ReactTestRenderer.ReactTestRenderer) => {
    const out: string[] = [];
    walk(t.toJSON(), (n) => {
        const id = n.props?.testID;
        if (typeof id === 'string') out.push(id);
    });
    return out;
};
const textOf = (t: ReactTestRenderer.ReactTestRenderer) => {
    const out: string[] = [];
    walk(t.toJSON(), (n) => n.children?.forEach((c) => typeof c === 'string' && out.push(c)));
    return out.join(' ');
};

describe('ScreenHeader', () => {
    it('names the screen', () => {
        const t = render(<ScreenHeader title="Sync queue" />);
        expect(textOf(t)).toContain('Sync queue');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers a back control that calls back', () => {
        const onBack = jest.fn();
        const t = render(<ScreenHeader title="Fill" onBack={onBack} />);
        expect(idsOf(t)).toContain('screen-back');
        // [0] is the Tamagui component, which carries onPress; the last match
        // is the host view, which carries the resolved style but no handler.
        const back = t.root.findAll((n) => n.props?.testID === 'screen-back')[0];
        ReactTestRenderer.act(() => {
            (back?.props as { onPress?: () => void }).onPress?.();
        });
        expect(onBack).toHaveBeenCalled();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('omits the control at a stack root, where there is nothing to go back to', () => {
        const t = render(<ScreenHeader title="Today" />);
        expect(idsOf(t)).not.toContain('screen-back');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('gives the back control a full 44pt target', () => {
        // Read from the resolved style, not the source: a variant can rewrite it.
        const t = render(<ScreenHeader title="Fill" onBack={() => {}} />);
        const back = t.root.findAll((n) => n.props?.testID === 'screen-back').pop();
        const style = Object.assign({}, ...[back?.props?.style ?? {}].flat());
        expect(style.width).toBeGreaterThanOrEqual(44);
        expect(style.height).toBeGreaterThanOrEqual(44);
        ReactTestRenderer.act(() => t.unmount());
    });
});
