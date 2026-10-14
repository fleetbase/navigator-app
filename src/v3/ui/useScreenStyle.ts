/**
 * The style a screen's scrolling root needs.
 *
 * A bare `<ScrollView style={{ flex: 1 }}>` paints the platform default behind
 * its content, not the theme's. Every screen in the app did that, so in dark,
 * night and sunlight the page background stayed light wherever content did not
 * cover it — section headers, the space under a short list, the area beside a
 * card. It went unnoticed for the whole build because the simulator's system
 * scheme is light, so the "dark scheme" screenshots were of a light app.
 *
 * `YStack` roots take `backgroundColor="$background"` and are fine; this is for
 * the ones whose root is a ScrollView, which cannot take a Tamagui token.
 */
import { useMemo } from 'react';
import { useTheme } from 'tamagui';

export function useScreenStyle(): { flex: 1; backgroundColor: string } {
    const theme = useTheme();
    const background = theme.background?.val as string;
    return useMemo(() => ({ flex: 1, backgroundColor: background }), [background]);
}

export default useScreenStyle;
