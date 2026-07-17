#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const densities = {
    ldpi: 36,
    mdpi: 48,
    hdpi: 72,
    xhdpi: 96,
    xxhdpi: 144,
    xxxhdpi: 192,
};

const androidSourceSets = ['main', 'debug'];
const notificationIcons = [
    path.join('main', 'res', 'drawable', 'ic_notification.png'),
    path.join('main', 'res', 'drawable', 'notification_icon.png'),
];

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

function roundMask(size) {
    return Buffer.from(
        `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
    );
}

async function writeIcon(source, destination, size, round) {
    await fs.mkdir(path.dirname(destination), { recursive: true });

    let image = sharp(source)
        .resize(size, size, {
            fit: 'cover',
            position: 'center',
        })
        .png();

    if (round) {
        image = image.composite([
            {
                input: roundMask(size),
                blend: 'dest-in',
            },
        ]);
    }

    await image.toFile(destination);
}

async function writeNotificationIcon(source, destination) {
    await fs.mkdir(path.dirname(destination), { recursive: true });

    await sharp(source)
        .resize(512, 512, {
            fit: 'contain',
            position: 'center',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(destination);
}

async function generateIcons() {
    const input = resolveProjectPath(readArg('--input', './assets/app-icon.png'));
    const androidSrcRoot = resolveProjectPath(readArg('--android-src', './android/app/src'));

    await fs.access(input);

    const writes = [];

    for (const sourceSet of androidSourceSets) {
        for (const [density, size] of Object.entries(densities)) {
            const mipmapDir = path.join(androidSrcRoot, sourceSet, 'res', `mipmap-${density}`);

            writes.push(writeIcon(input, path.join(mipmapDir, 'ic_launcher.png'), size, false));
            writes.push(writeIcon(input, path.join(mipmapDir, 'ic_launcher_round.png'), size, true));
        }
    }

    for (const notificationIcon of notificationIcons) {
        writes.push(writeNotificationIcon(input, path.join(androidSrcRoot, notificationIcon)));
    }

    await Promise.all(writes);

    console.log(`Updated Android launcher and notification icons from ${path.relative(process.cwd(), input)}`);
}

generateIcons().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
