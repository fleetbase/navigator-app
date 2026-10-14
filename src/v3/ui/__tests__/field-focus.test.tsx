import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme, XStack, YStack } from 'tamagui';
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

/**
 * Guards the select rendering "[object Object]" for ordinary `{label, value}`
 * options — nine rows of it appeared in the issue type picker on device,
 * because without an explicit `optionLabel` the component fell back to
 * `String(item)`.
 */
describe('select option labels', () => {
    const { labelOf, valueOf } = require('../Select') as {
        labelOf: (item: unknown, key?: string) => string;
        valueOf: (item: unknown, key?: string) => string;
    };

    it('reads label and value from a plain option object', () => {
        expect(labelOf({ label: 'Vehicle', value: 'VEHICLE' })).toBe('Vehicle');
        expect(valueOf({ label: 'Vehicle', value: 'VEHICLE' })).toBe('VEHICLE');
    });

    it('never yields "[object Object]"', () => {
        expect(labelOf({ name: 'Driver' })).toBe('Driver');
        expect(labelOf({ title: 'Route' })).toBe('Route');
        expect(labelOf({ nothing: 1 })).toBe('');
        expect(labelOf({ label: 'x' })).not.toContain('object Object');
    });

    it('still honours an explicit key', () => {
        expect(labelOf({ label: 'ignored', custom: 'used' }, 'custom')).toBe('used');
    });

    it('resolves a stored value back to its label for display', () => {
        // The trigger read "VEHICLE" after the driver picked "Vehicle".
        const options = [
            { label: 'Vehicle', value: 'VEHICLE' },
            { label: 'Driver', value: 'DRIVER' },
        ];
        const match = options.find((o) => valueOf(o) === 'VEHICLE');
        expect(labelOf(match)).toBe('Vehicle');
    });

    it('passes primitives straight through', () => {
        expect(labelOf('Low')).toBe('Low');
        expect(valueOf(3)).toBe('3');
        expect(labelOf(null)).toBe('');
    });
});

/**
 * Guards the theme picker collapsing into unusable slivers.
 *
 * Every option inside `Segmented` is `flex: 1`. The group itself had no width,
 * so in any row that did not stretch it — Settings wrapped two groups in one
 * `XStack` — it collapsed to zero and rendered five thin bars that could not be
 * read or tapped. The theme could not be changed at all, and no test noticed,
 * because the options were all still present in the tree.
 */
describe('Segmented layout', () => {
    const { Segmented } = require('../Field') as {
        Segmented: (p: Record<string, unknown>) => React.ReactElement;
    };

    function renderSegmented(wrapper: 'row' | 'column') {
        const options = [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
        ];
        const inner = <Segmented options={options} value="a" onChange={() => {}} testID="seg" />;
        let tree!: ReactTestRenderer.ReactTestRenderer;
        ReactTestRenderer.act(() => {
            tree = ReactTestRenderer.create(
                <TamaguiProvider config={config} defaultTheme="dark">
                    <Theme name="dark">
                        {wrapper === 'row' ? <XStack flexWrap="wrap">{inner}</XStack> : <YStack>{inner}</YStack>}
                    </Theme>
                </TamaguiProvider>
            );
        });
        // `.pop()` — the first matches are Tamagui wrappers with no style; the
        // host view is last.
        const node = tree.root.findAll((n) => n.props?.testID === 'seg').pop();
        const style = node?.props?.style;
        const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
        ReactTestRenderer.act(() => tree.unmount());
        return (flat ?? {}) as Record<string, unknown>;
    }

    it('claims a width of its own, so it cannot collapse in a wrapping row', () => {
        expect(renderSegmented('row').width).toBe('100%');
    });

    it('does the same inside a column', () => {
        expect(renderSegmented('column').width).toBe('100%');
    });
});
