#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const bootSplashLogoSizes = {
    ldpi: 216,
    mdpi: 288,
    hdpi: 432,
    xhdpi: 576,
    xxhdpi: 864,
    xxxhdpi: 1152,
};

const mipmapDensities = ['ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const drawableDensities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

function readArg(name, fallback) {
    const index = process.argv.indexOf(name);

    if (index === -1) {
        return fallback;
    }

    return process.argv[index + 1] || fallback;
}

function resolveProjectPath(value) {
    return path.resolve(process.cwd(), value);
}

async function writeBootSplashLogo(source, destination, size) {
    await fs.mkdir(path.dirname(destination), { recursive: true });

    await sharp(source)
        .resize(size, size, {
            fit: 'contain',
            position: 'center',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(destination);
}

async function generateLaunchScreenAssets() {
    const input = resolveProjectPath(readArg('--input', './assets/splash-screen.png'));
    const androidSrcRoot = resolveProjectPath(readArg('--android-src', './android/app/src'));
    const sourceSet = readArg('--source-set', 'main');
    const resRoot = path.join(androidSrcRoot, sourceSet, 'res');

    await fs.access(input);

    const writes = [];

    for (const density of mipmapDensities) {
        writes.push(
            writeBootSplashLogo(input, path.join(resRoot, `mipmap-${density}`, 'bootsplash_logo.png'), bootSplashLogoSizes[density])
        );
    }

    for (const density of drawableDensities) {
        writes.push(
            writeBootSplashLogo(input, path.join(resRoot, `drawable-${density}`, 'bootsplash_logo.png'), bootSplashLogoSizes[density])
        );
    }

    await Promise.all(writes);

    console.log(`Updated Android bootsplash logo assets from ${path.relative(process.cwd(), input)}`);
}

generateLaunchScreenAssets().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
