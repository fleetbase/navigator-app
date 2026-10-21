#!/usr/bin/env node
/**
 * Generates the native app icon and launch screen from the build's artwork.
 *
 *   node scripts/generate-app-assets.js icon      (yarn generate:app-icon)
 *   node scripts/generate-app-assets.js launch    (yarn generate:launch-screen)
 *
 * Artwork comes from brand/ (a client build's own folder), falling back to the
 * templates in assets/:
 *
 *   brand/app-icon.png       1024×1024, no transparency
 *   brand/splash-screen.png  the launch screen logo
 *
 * The launch screen's background is `--background`, else branding
 * `boot.background` read from brand/navigator.brand.ts, else Waypoint dark
 * (#0B1017) — the colour the app's first frame paints, so there is no flash
 * between the native splash and the app.
 *
 * These write into ios/ and android/. A client build runs them in its release
 * pipeline rather than committing the output, so upstream merges stay clean.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_BACKGROUND = '#0B1017';
const HEX = /^#[0-9a-fA-F]{6}$/;

const firstExisting = (files) => files.find((file) => fs.existsSync(path.join(ROOT, file)));

function readArg(name) {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
}

/**
 * Loads the build's brand file. It is TypeScript and imports the app's
 * `defineBranding`, so it is compiled with Babel and run with that one import
 * stubbed — the data, not a regex over the source.
 */
function readBrandConfig() {
    const file = ['brand/navigator.brand.ts', 'brand/navigator.brand.tsx', 'brand/navigator.brand.js'].map((f) => path.join(ROOT, f)).find((f) => fs.existsSync(f));
    if (!file) return null;
    const { transformFileSync } = require('@babel/core');
    const { code } = transformFileSync(file, {
        babelrc: false,
        configFile: false,
        filename: file,
        presets: [[require.resolve('@babel/preset-typescript'), { allExtensions: true, isTSX: file.endsWith('x') }]],
        plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    });
    const module = { exports: {} };
    const localRequire = (request) => {
        if (/branding\/define$/.test(request)) return { defineBranding: (config) => config };
        return require(path.resolve(path.dirname(file), request));
    };
    vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, console });
    return module.exports.default ?? module.exports;
}

function launchBackground() {
    const explicit = readArg('--background');
    if (explicit) return explicit;
    try {
        const background = readBrandConfig()?.boot?.background;
        if (typeof background === 'string' && HEX.test(background)) return background;
        if (background !== undefined) console.warn(`[generate-app-assets] boot.background "${background}" is not a #rrggbb colour; using ${DEFAULT_BACKGROUND}.`);
    } catch (error) {
        console.warn(`[generate-app-assets] Could not read brand/navigator.brand.ts (${error.message}); using ${DEFAULT_BACKGROUND}.`);
    }
    return DEFAULT_BACKGROUND;
}

const run = (command) => {
    console.log(`$ ${command}`);
    execSync(command, { cwd: ROOT, stdio: 'inherit' });
};

function generateIcon() {
    const icon = firstExisting(['brand/app-icon.png', 'assets/app-icon.png']);
    if (!icon) throw new Error('No app icon: add brand/app-icon.png (1024×1024).');
    run(`npx app-icon generate -i ./${icon}`);
    run(`node scripts/fix-android-app-icons.js --input ./${icon}`);
}

function generateLaunchScreen() {
    const splash = firstExisting(['brand/splash-screen.png', 'assets/splash-screen.png']);
    if (!splash) throw new Error('No launch screen artwork: add brand/splash-screen.png.');
    const background = launchBackground();
    run(`npx react-native generate-bootsplash ./${splash} --background=${background} --logo-width=100 --flavor=main`);
    run(`node scripts/fix-android-launch-screen.js --input ./${splash}`);
}

module.exports = { readBrandConfig, launchBackground };

if (require.main === module) {
    const task = process.argv[2];
    if (task === 'icon') generateIcon();
    else if (task === 'launch') generateLaunchScreen();
    else if (task === 'background') console.log(launchBackground());
    else {
        console.error('Usage: node scripts/generate-app-assets.js <icon|launch|background> [--background #rrggbb]');
        process.exit(1);
    }
}
