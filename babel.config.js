// Every tool that compiles the app (Metro, Jest) loads this file first, so the brand/
// lookup is refreshed before any module resolves it.
require('./scripts/link-brand').linkBrand(__dirname);

module.exports = {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
        'preval',
        'react-native-reanimated/plugin',
        '@babel/plugin-proposal-export-namespace-from',
        ...(process.env.NODE_ENV === 'test'
            ? [
                  // Screens load through `import()` (the screen registry). Jest runs
                  // CommonJS, so turn it into a require there; Metro handles it natively.
                  '@babel/plugin-transform-dynamic-import',
              ]
            : [
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
              ]),
    ],
};
