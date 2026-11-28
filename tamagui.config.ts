import { config as baseConfig } from '@tamagui/config/v3';
import { createTamagui, createTokens } from 'tamagui';
import { colors, globalColors, themes } from './tamagui.themes';
import { flattenTailwindCssColorsObject } from './src/utils/tamagui';

export { themes };

const tokens = createTokens({
    ...baseConfig.tokens,
    color: {
        ...globalColors,
        ...flattenTailwindCssColorsObject(colors),
    },
});

const appConfig = createTamagui({
    ...baseConfig,
    themes,
    tokens,
});

export type AppConfig = typeof appConfig;

declare module 'tamagui' {
    interface TamaguiCustomConfig extends AppConfig {}
}

export default appConfig;
