const fs = require('fs');
const path = require('path');

// brand/fonts: a client build's own font files (named by PostScript name), linked
// alongside the app's with `npx react-native-asset` in the build pipeline.
const brandFonts = path.join(__dirname, 'brand', 'fonts');

module.exports = {
    assets: ['./assets/fonts', ...(fs.existsSync(brandFonts) ? ['./brand/fonts'] : [])],
    dependencies: {
        '@bam.tech/react-native-image-resizer': {
            platforms: {
                android: {
                    libraryName: null,
                    componentDescriptors: null,
                    cmakeListsPath: null,
                },
            },
        },
        '@react-native-community/blur': {
            platforms: {
                android: {
                    libraryName: null,
                    componentDescriptors: null,
                    cmakeListsPath: null,
                },
            },
        },
    },
};
