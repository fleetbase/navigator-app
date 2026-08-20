import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { Field } from '../Field';

/**
 * Guards the defect that made every text field in v3 unusable.
 *
 * The focus ring used to be a variant on the element wrapping the input, driven
 * by the input's own `onFocus`. Changing the style of any ancestor of a focused
 * TextInput makes it resign first responder on iOS, so the field focused and
 * blurred within the same tap — no caret, no keyboard, nothing typeable, sign-in
 * included. See the comment at the top of Field.tsx for the device measurements.
 *
 * The invariant that fixes it: **the frame holding the input must render
 * identically whether or not the field is focused.** Everything that reacts to
 * focus belongs on the sibling ring overlay.
 */
function render(scheme: SchemeName = 'dark', props: Record<string, unknown> = {}) {
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <Field testID="f" placeholder="Search" {...props} />
                </Theme>
            </TamaguiProvider>
        );
    });
    // @ts-expect-error assigned inside act
    return tree;
}

const styleOf = (t: ReactTestRenderer.ReactTestRenderer, id: string) =>
    JSON.stringify(t.root.findAll((n) => n.props?.testID === id)[0]?.props?.style ?? null);

function focus(t: ReactTestRenderer.ReactTestRenderer) {
    const input = t.root.findAll((n) => n.props?.testID === 'f-input')[0];
    ReactTestRenderer.act(() => {
        (input.props as { onFocus?: () => void }).onFocus?.();
    });
}

describe('Field focus', () => {
    it('does not change the frame around the input when focused', () => {
        const t = render();
        const before = styleOf(t, 'f-frame');
        focus(t);
        expect(styleOf(t, 'f-frame')).toBe(before);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('does change the sibling ring when focused, so the state is still visible', () => {
        const t = render();
        const before = styleOf(t, 'f-ring');
        focus(t);
        expect(styleOf(t, 'f-ring')).not.toBe(before);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('keeps the ring out of the input hierarchy and untouchable', () => {
        const t = render();
        const ring = t.root.findAll((n) => n.props?.testID === 'f-ring')[0];
        expect(ring.props.pointerEvents).toBe('none');
        // The ring must not contain the input — an ancestor is what broke it.
        expect(ring.findAll((n) => n.props?.testID === 'f-input')).toHaveLength(0);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('holds the frame constant in the error state too', () => {
        const t = render('dark', { error: 'Required' });
        const before = styleOf(t, 'f-frame');
        focus(t);
        expect(styleOf(t, 'f-frame')).toBe(before);
        ReactTestRenderer.act(() => t.unmount());
    });

    it.each(SCHEMES)('holds the frame constant on focus in the %s scheme', (scheme) => {
        const t = render(scheme);
        const before = styleOf(t, 'f-frame');
        focus(t);
        expect(styleOf(t, 'f-frame')).toBe(before);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('still reports focus to the caller via onBlur', () => {
        const onBlur = jest.fn();
        const t = render('dark', { onBlur });
        const input = t.root.findAll((n) => n.props?.testID === 'f-input')[0];
        ReactTestRenderer.act(() => {
            (input.props as { onBlur?: () => void }).onBlur?.();
        });
        expect(onBlur).toHaveBeenCalled();
        ReactTestRenderer.act(() => t.unmount());
    });
});
