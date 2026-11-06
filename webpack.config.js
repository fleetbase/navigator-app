/**
 * The browser build of the v3 app (docs/web.md). Native-only packages are swapped
 * for the implementations in web/ through `resolve.alias`, so app code imports
 * the same module names on every platform.
 */
require('./scripts/link-brand').linkBrand(__dirname);
require('dotenv').config({ path: process.env.ENVFILE || '.env' });

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const root = (...segments) => path.resolve(__dirname, ...segments);
const shim = (name) => root('web', name);

/**
 * A browser bundle is public, so only values listed here reach it. FLEETBASE_KEY
 * is an organisation's API key and must never be on this list: a build that needs
 * a key before sign-in sets FLEETBASE_WEB_KEY to a credential safe to publish.
 */
const PUBLIC_ENV = [
    'APP_NAME',
    'APP_IDENTIFIER',
    'APP_LINK_PREFIX',
    'APP_THEME',
    'AVAILABLE_LOCALES',
    'CUSTOM_COLORS',
    'CUSTOM_COLORS_DARK',
    'CUSTOM_COLORS_LIGHT',
    'CUSTOM_COLORS_NIGHT',
    'CUSTOM_COLORS_SUNLIGHT',
    'DEFAULT_COORDINATES',
    'DEFAULT_LOCALE',
    'FLEETBASE_HOST',
    'FLEETBASE_PLATFORM_TOKEN',
    'MAP_TILES_DARK',
    'MAP_TILES_LIGHT',
    'NAVIGATOR_BRAND',
    'NAVIGATOR_BRAND_PRIMARY',
    'SOCKETCLUSTER_HOST',
    'SOCKETCLUSTER_PATH',
    'SOCKETCLUSTER_PORT',
    'SOCKETCLUSTER_SECURE',
];

function publicConfig() {
    const config = Object.fromEntries(PUBLIC_ENV.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
    // The web build has one tree, whatever .env selects for the native apps.
    config.NAVIGATOR_V3 = 'true';
    // The SDK refuses an empty key. A driver's token replaces this at sign-in.
    config.FLEETBASE_KEY = process.env.FLEETBASE_WEB_KEY || process.env.FLEETBASE_PLATFORM_TOKEN || 'web';
    return config;
}

/** Packages published as untranspiled React Native source. */
const SOURCE_PACKAGES = /node_modules[\\/](?!react-native-web[\\/])(react-native[^\\/]*|@react-native[^\\/]*|@react-navigation|@gorhom|@backpackapp-io|@bam\.tech|@fortawesome[\\/]react-native-fontawesome|recyclerlistview)[\\/]/;

const babel = (sourceType, extraPlugins = []) => ({
    loader: 'babel-loader',
    options: {
        babelrc: false,
        configFile: false,
        cacheDirectory: true,
        sourceType,
        presets: [['module:@react-native/babel-preset', { disableImportExportTransform: true, enableBabelRuntime: false }]],
        plugins: [...extraPlugins, 'react-native-reanimated/plugin'],
    },
});

module.exports = (env = {}, argv = {}) => {
    const production = argv.mode === 'production';

    return {
        target: 'web',
        mode: production ? 'production' : 'development',
        devtool: production ? 'source-map' : 'eval-cheap-module-source-map',
        entry: root('index.web.tsx'),
        output: {
            path: root('dist'),
            filename: production ? '[name].[contenthash].js' : '[name].js',
            publicPath: env.publicPath || '/',
            clean: true,
        },
        // Warn at a size that would hurt a driver on a mobile connection, not webpack's 244KB.
        performance: { maxAssetSize: 6 * 1024 * 1024, maxEntrypointSize: 6 * 1024 * 1024 },
        module: {
            rules: [
                { test: /\.m?js$/, resolve: { fullySpecified: false } },
                {
                    test: /\.(js|jsx|ts|tsx)$/,
                    include: [root('index.web.tsx'), root('App.web.tsx'), root('App.v3.tsx'), root('navigator.brand.ts'), root('navigator.config.ts'), root('navigator.extensions.ts'), root('tamagui.config.ts'), root('src'), root('web'), root('brand')],
                    use: babel('module', [shim('babel-plugin-rn-props.js')]),
                },
                { test: /\.(js|jsx|ts|tsx)$/, include: SOURCE_PACKAGES, use: babel('unambiguous') },
                { test: /\.css$/, use: ['style-loader', 'css-loader'] },
                { test: /\.(ttf|otf|woff2?)$/, type: 'asset/resource', generator: { filename: 'fonts/[name].[hash:8][ext]' } },
                { test: /\.(png|jpe?g|gif|webp|svg)$/, type: 'asset', generator: { filename: 'images/[name].[hash:8][ext]' } },
            ],
        },
        resolve: {
            mainFields: ['browser', 'module', 'main'],
            extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
            alias: {
                'react-native$': shim('react-native.js'),
                '@brand-fonts': fs.existsSync(root('brand', 'fonts')) ? root('brand', 'fonts') : shim('no-brand-fonts'),
                // No browser build, so implemented here against the browser's own APIs.
                '@gorhom/bottom-sheet': shim('bottom-sheet.jsx'),
                'react-native-background-fetch': shim('background-fetch.js'),
                'react-native-background-geolocation': shim('background-geolocation.js'),
                'react-native-config': shim('config.js'),
                'react-native-device-info': shim('device-info.js'),
                'react-native-i18n': shim('i18n.js'),
                'react-native-maps': shim('maps.jsx'),
                'react-native-notifications': shim('notifications.js'),
                'react-native-permissions': shim('permissions.js'),
                'react-native-signature-canvas': shim('signature-canvas.jsx'),
            },
        },
        plugins: [
            new webpack.ProvidePlugin({ process: 'process/browser.js', __ariaState: [shim('aria.js'), 'ariaState'], __ariaValue: [shim('aria.js'), 'ariaValue'] }),
            new webpack.DefinePlugin({
                __DEV__: JSON.stringify(!production),
                __WEB_CONFIG__: JSON.stringify(publicConfig()),
                __APP_VERSION__: JSON.stringify(require('./package.json').version),
                'process.env.TAMAGUI_TARGET': JSON.stringify('web'),
            }),
            new HtmlWebpackPlugin({ template: root('web', 'index.html'), title: process.env.APP_NAME || 'Navigator', favicon: root('assets', 'icon.png') }),
        ],
        devServer: {
            port: Number(process.env.WEB_PORT) || 8080,
            historyApiFallback: true,
            hot: true,
            client: { overlay: { warnings: false, runtimeErrors: true } },
        },
        ignoreWarnings: [
            // React 19 removed these from react-dom. react-native-web only calls them from its legacy
            // `render` API, which index.web.tsx doesn't use, and findNodeHandle falls back without one.
            { module: /react-native-web[\\/]dist[\\/]exports[\\/](findNodeHandle|render|unmountComponentAtNode)/ },
            // A re-exported TypeScript type, erased by Babel.
            { module: /@backpackapp-io[\\/]react-native-toast/, message: /ToastAnimationType/ },
        ],
        stats: 'errors-warnings',
    };
};
