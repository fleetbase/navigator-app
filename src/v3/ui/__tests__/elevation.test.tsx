import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { Surface } from '../Surface';
import { Button } from '../Button';
import { elevation } from '../../theme/tokens';

/**
 * Guards design fidelity on shadows.
 *
 * `elevation` is an Android style prop, but Tamagui also treats it as a
 * shorthand and expands it into shadow props. A token carrying both meant
 * Tamagui's expansion won: a card written as `shadowOpacity: 0.12` resolved to
 * **`shadowOpacity: 1`** — a fully opaque near-black shadow under every card,
 * row and sheet in the app, far heavier than the design draws.
 *
 * Specified values are not what ships; resolved ones are. These assert what a
 * component actually renders with.
 */
function resolvedStyle(node: React.ReactElement, scheme: SchemeName = 'light'): Record<string, unknown> {
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>{node}</Theme>
            </TamaguiProvider>
        );
    });
    // @ts-expect-error assigned inside act
    const found = tree.root.findAll((n) => n.props?.testID === 'probe').pop();
    const style = found?.props?.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
    ReactTestRenderer.act(() => tree.unmount());
    return (flat ?? {}) as Record<string, unknown>;
}

describe('elevation tokens', () => {
    it('carries no `elevation` key, which Tamagui would expand over the shadow', () => {
        for (const [name, value] of Object.entries(elevation)) {
            expect({ name, hasElevation: 'elevation' in value }).toEqual({ name, hasElevation: false });
        }
    });

    it('keeps every shadow subtle enough to read as depth, not as a border', () => {
        for (const [name, value] of Object.entries(elevation)) {
            expect({ name, ok: value.shadowOpacity <= 0.25 }).toEqual({ name, ok: true });
        }
    });
});

describe('resolved shadows', () => {
    it('renders a card at the specified opacity, not a fully opaque one', () => {
        const style = resolvedStyle(<Surface testID="probe" />);
        expect(style.shadowOpacity).toBe(elevation.card.shadowOpacity);
        expect(style.shadowRadius).toBe(elevation.card.shadowRadius);
        // The regression: Tamagui resolved this to 1.
        expect(style.shadowOpacity).not.toBe(1);
    });

    it.each(SCHEMES)('keeps the card shadow subtle in the %s scheme', (scheme) => {
        const style = resolvedStyle(<Surface testID="probe" />, scheme);
        expect(Number(style.shadowOpacity)).toBeLessThanOrEqual(0.25);
    });

    it('draws no shadow at all on a flat surface', () => {
        const style = resolvedStyle(<Surface level="flat" testID="probe" />);
        expect(style.shadowOpacity).toBe(0);
    });

    it("keeps the elevated button's glow at its specified opacity", () => {
        const style = resolvedStyle(<Button elevated testID="probe">Go</Button>);
        expect(Number(style.shadowOpacity)).toBeLessThanOrEqual(0.25);
        expect(style.shadowOpacity).not.toBe(1);
    });
});
