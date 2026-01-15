module.exports = {
    presets: [['module:@react-native/babel-preset', { useTransformReactJSXExperimental: true }]],
    plugins: [
        ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
        'preval',
        'react-native-reanimated/plugin',
        '@babel/plugin-proposal-export-namespace-from',
        [
            '@tamagui/babel-plugin',
            {
                components: ['tamagui'],
                config: './tamagui.config.ts',
                importsWhitelist: ['constants.js', 'colors.js'],
                logTimings: true,
                disableExtraction: process.env.NODE_ENV === 'development',
                experimentalFlattenThemesOnNative: false,
            },
        ],
    ],
};
