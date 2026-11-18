/**
 * Keeps user-visible English out of the source: every string a rider can read must come from
 * translations/en.json through t() / translate(). See scripts/find-hardcoded-strings.js for the rules.
 */
const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const en = require('../translations/en.json');
const { findHardcodedStrings, findInSource, listFiles, SRC } = require('../scripts/find-hardcoded-strings');

const lookup = (key) => key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), en);

describe('no hard-coded user-visible strings', () => {
    test('src/ has no string literals in JSX text, text props, alerts or toasts', () => {
        const found = findHardcodedStrings().map((f) => `${f.file}:${f.line} "${f.text}"`);
        expect(found).toEqual([]);
    });

    test.each([
        ['JSX text', "const A = () => <Text>Hello rider</Text>;"],
        ['JSX text prop', "const A = () => <Input placeholder='Enter phone number' />;"],
        ['Alert.alert', "Alert.alert('Title', 'Are you sure?');"],
        ['toast', "toast.success('Saved.');"],
        ['button text in an object', "const b = [{ text: 'Cancel' }];"],
        ['default parameter', "const A = ({ title = 'Select an option' }) => null;"],
        ['ternary shown on screen', "const A = () => <Text>{on ? 'Online' : 'Offline'}</Text>;"],
        ['tab label', "const o = { tabBarLabel: 'Orders' };"],
        ['N/A fallback', "const A = () => <Text>{value ?? 'N/A'}</Text>;"],
    ])('catches %s', (_name, code) => {
        expect(findInSource(code).length).toBeGreaterThan(0);
    });

    test('lets translated text, styles and navigation names through', () => {
        const ok = `
            const A = () => <Text color='$textPrimary' fontWeight='bold'>{t('common.ok')}</Text>;
            navigation.navigate('DriverAccount');
            toast.success(t('AccountScreen.cacheCleared'));
        `;
        expect(findInSource(ok)).toEqual([]);
    });
});

describe('translation keys used in code exist in en.json', () => {
    const used = [];
    for (const file of listFiles(SRC)) {
        if (file.includes('/legacy/')) continue;
        const ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx', 'typescript'] });
        traverse(ast, {
            CallExpression(p) {
                const callee = p.node.callee;
                const name = callee.type === 'Identifier' ? callee.name : null;
                const [first] = p.node.arguments;
                if ((name === 't' || name === 'translate') && first && first.type === 'StringLiteral') used.push({ file: file.replace(SRC, 'src'), key: first.value });
            },
        });
    }

    test('finds the keys', () => {
        expect(used.length).toBeGreaterThan(200);
    });

    // Already missing upstream (the setup warning screen was copied from the Storefront app); not part of this change.
    const knownMissing = ['common.storefront'];

    test.each(used.filter((u) => !knownMissing.includes(u.key)).map((u) => [u.file, u.key]))('%s uses %s', (_file, key) => {
        expect(lookup(key)).toBeDefined();
    });
});

describe('placeholders', () => {
    const placeholdersOf = (value) => {
        const texts = typeof value === 'string' ? [value] : Object.values(value ?? {});
        return [...new Set(texts.flatMap((text) => [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])))].sort();
    };

    test('every {{placeholder}} in en.json is passed by the code that uses the key', () => {
        const used = [];
        for (const file of listFiles(SRC)) {
            if (file.includes('/legacy/')) continue;
            const ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx', 'typescript'] });
            traverse(ast, {
                CallExpression(p) {
                    const callee = p.node.callee;
                    const [first, options] = p.node.arguments;
                    if (callee.type === 'Identifier' && (callee.name === 't' || callee.name === 'translate') && first && first.type === 'StringLiteral' && lookup(first.value) !== undefined) {
                        const passed = options && options.type === 'ObjectExpression' ? options.properties.map((prop) => prop.key.name || prop.key.value) : [];
                        used.push({ file: file.replace(SRC, 'src'), key: first.value, passed: [...new Set(passed)].sort() });
                    }
                },
            });
        }
        const mismatches = used.filter((u) => JSON.stringify(placeholdersOf(lookup(u.key))) !== JSON.stringify(u.passed.filter((n) => placeholdersOf(lookup(u.key)).includes(n)))).map((u) => `${u.file}: ${u.key}`);
        expect(mismatches).toEqual([]);
    });
});
