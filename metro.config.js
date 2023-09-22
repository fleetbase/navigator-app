const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');
const fs = require('fs');

// Constants
const RNMBNAVPATH = path.resolve(__dirname, 'node_modules/@fleetbase/react-native-mapbox-navigation');

// Check if the path exists
if (!fs.existsSync(RNMBNAVPATH)) {
    console.error('Error: Path does not exist:', RNMBNAVPATH);
    process.exit(1);
}

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
    transformer: {
        getTransformOptions: async () => ({
            transform: {
                experimentalImportSupport: false,
                inlineRequires: true,
            },
        }),
    },
    resolver: {
        nodeModulesPaths: [RNMBNAVPATH],
    },
    watchFolders: [RNMBNAVPATH],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
