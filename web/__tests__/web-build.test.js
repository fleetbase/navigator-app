/**
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');
const { transformSync } = require('@babel/core');

const SECRET = 'do-not-publish-this-key';

function loadConfig() {
    process.env.FLEETBASE_KEY = SECRET;
    process.env.TRANSISTORSOFT_LICENSE_KEY = SECRET;
    process.env.GOOGLE_MAPS_API_KEY = SECRET;
    delete process.env.FLEETBASE_WEB_KEY;
    delete process.env.FLEETBASE_PLATFORM_TOKEN;
    return require('../../webpack.config.js')({}, { mode: 'production' });
}

describe('webpack config', () => {
    const config = loadConfig();

    it('never bundles a secret from .env', () => {
        const define = config.plugins.find((plugin) => plugin.definitions?.__WEB_CONFIG__);
        const bundled = define.definitions.__WEB_CONFIG__;
        expect(bundled).not.toContain(SECRET);
        expect(JSON.parse(bundled).FLEETBASE_KEY).toBe('web');
    });

    it('points every aliased package at a file that exists', () => {
        for (const target of Object.values(config.resolve.alias)) {
            expect(fs.existsSync(target)).toBe(true);
        }
    });
});

describe('babel-plugin-rn-props', () => {
    const transform = (code) =>
        transformSync(code, {
            babelrc: false,
            configFile: false,
            plugins: ['@babel/plugin-syntax-jsx', path.join(__dirname, '..', 'babel-plugin-rn-props.js')],
        }).code;

    it('turns accessibility props into ARIA helpers', () => {
        expect(transform('<A accessibilityState={{ selected }} />')).toContain('{...__ariaState({');
        expect(transform('<A accessibilityValue={value} />')).toContain('{...__ariaValue(value)}');
    });

    it('renames the logical offsets', () => {
        expect(transform('<A start={4} end={8} />')).toBe('<A insetInlineStart={4} insetInlineEnd={8} />;');
    });
});
