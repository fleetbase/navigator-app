import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const { linkBrand } = require('../../../../scripts/link-brand');

describe('scripts/link-brand.js', () => {
    let root: string;
    const generated = (file: string) => readFileSync(join(root, 'src', 'v3', 'generated', file), 'utf8');

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'link-brand-'));
        writeFileSync(join(root, 'navigator.brand.ts'), 'export default {};');
        writeFileSync(join(root, 'navigator.extensions.ts'), 'export default {};');
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('points at the root templates when there is no brand/', () => {
        const result = linkBrand(root);
        expect(result.brandConfig).toBe('navigator.brand');
        expect(generated('brand-config.ts')).toContain("from '../../../navigator.brand'");
        expect(generated('brand-config.ts')).toContain('BRAND_DIR = null');
        expect(generated('brand-translations.ts')).toContain('= {\n};');
        expect(generated('brand-assets.ts')).toContain('logo: number | null = null');
    });

    it('prefers brand/ files, and links translations, fonts and the logo', () => {
        mkdirSync(join(root, 'brand', 'translations'), { recursive: true });
        mkdirSync(join(root, 'brand', 'fonts'), { recursive: true });
        writeFileSync(join(root, 'brand', 'navigator.brand.ts'), 'export default {};');
        writeFileSync(join(root, 'brand', 'translations', 'en.json'), '{}');
        writeFileSync(join(root, 'brand', 'translations', 'not a locale.json'), '{}');
        writeFileSync(join(root, 'brand', 'fonts', 'Inter-Bold.ttf'), '');
        writeFileSync(join(root, 'brand', 'logo.png'), '');

        const result = linkBrand(root);
        expect(result).toMatchObject({ brandConfig: 'brand/navigator.brand', brandExtensions: 'navigator.extensions', locales: ['en'], fonts: ['Inter-Bold'], logo: true });
        expect(generated('brand-config.ts')).toContain("from '../../../brand/navigator.brand'");
        expect(generated('brand-config.ts')).toContain("BRAND_DIR = 'brand'");
        expect(generated('brand-translations.ts')).toContain('"en": t0');
        expect(generated('brand-assets.ts')).toContain('["Inter-Bold"]');
        expect(generated('brand-assets.ts')).toContain("require('../../../brand/logo.png')");
    });
});
