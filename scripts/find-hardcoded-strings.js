/**
 * Finds user-visible English string literals in src/ that bypass translations/en.json.
 * Used by __tests__/NoHardcodedStrings-test.js; run directly to list them:
 *
 *   node scripts/find-hardcoded-strings.js
 *
 * What it flags: JSX text; string values of user-visible JSX props and object properties
 * (title, label, placeholder, text, message, tabBarLabel, headerBackTitle, ...); string
 * arguments to toast.* and Alert.alert; default parameter values with those names; and a
 * capitalised literal on either side of a ternary or `||`/`??` that is shown on screen.
 *
 * Known limits (it reads syntax, it does not know what reaches the screen):
 *  - Not flagged: a literal kept in a variable (`let text = 'No messages'`), a `useState('...')`
 *    initial value, a setter argument, a `return 'Just now'`, an `Error('...')` message that is
 *    shown later, a string inside a constants file, or a literal passed to a helper function.
 *  - Not flagged: text a native library draws on its own (see ProofOfDeliveryScreen, where the
 *    signature pad's texts are passed as props), and server text.
 *  - May flag prose in an object with a `message`/`title`/`text` key that nobody sees; if that
 *    happens, move the wording to a name outside the list or add the file to EXCLUDED with a reason.
 * So a green test means "none of the common patterns", not "everything is translated".
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const SRC = path.join(__dirname, '..', 'src');

// Skipped on purpose. Every entry needs a reason.
const EXCLUDED = [
    // Old copy of the app that nothing imports.
    'legacy/',
    // Placeholder screens: Test ("Hello World") is registered in CoreStack but nothing navigates to it;
    // Fleet, Vehicle and DriverFleet are imported nowhere.
    'screens/TestScreen.tsx',
    'screens/FleetScreen.tsx',
    'screens/VehicleScreen.tsx',
    'screens/DriverFleetScreen.tsx',
    // Currency names and symbols: reference data, not UI text.
    'utils/currencies.js',
];

const TEXT_PROPS = new Set([
    'title',
    'label',
    'placeholder',
    'text',
    'subtitle',
    'description',
    'headerTitle',
    'headerBackTitle',
    'tabBarLabel',
    'drawerLabel',
    'message',
    'accessibilityLabel',
    'accessibilityHint',
    'confirmText',
    'clearText',
    'descriptionText',
    'cancelText',
    'loadingText',
    'submitText',
    'searchPlaceholder',
    'confirmTitle',
    'confirmMessage',
    'alt',
]);

function listFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return listFiles(full);
        return /\.(tsx?|jsx?)$/.test(entry.name) ? [full] : [];
    });
}

const hasLetters = (value) => /[A-Za-z]{2,}/.test(value) || value.trim() === 'N/A';

function literalText(node) {
    if (!node) return null;
    if (node.type === 'StringLiteral') return node.value;
    if (node.type === 'TemplateLiteral') return node.quasis.map((q) => q.value.cooked).join('{}');
    return null;
}


function findInSource(code, rel = 'inline') {
    const found = [];
    {
        const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
        const report = (node, text) => found.push({ file: rel, line: node.loc.start.line, text: text.trim().replace(/\s+/g, ' ') });
        traverse(ast, {
            JSXText(p) {
                if (hasLetters(p.node.value)) report(p.node, p.node.value);
            },
            JSXAttribute(p) {
                const name = p.node.name.name;
                if (!TEXT_PROPS.has(name)) return;
                let value = p.node.value;
                if (value && value.type === 'JSXExpressionContainer') value = value.expression;
                const text = literalText(value);
                if (text !== null && hasLetters(text)) report(p.node, text);
            },
            // Default parameter values, e.g. ({ placeholder = 'Select an option' }) =>
            AssignmentPattern(p) {
                if (p.node.left.type !== 'Identifier' || !TEXT_PROPS.has(p.node.left.name)) return;
                const text = literalText(p.node.right);
                if (text !== null && hasLetters(text)) report(p.node, text);
            },
            ObjectProperty(p) {
                const key = p.node.key.name || p.node.key.value;
                if (!TEXT_PROPS.has(key)) return;
                const text = literalText(p.node.value);
                if (text !== null && hasLetters(text)) report(p.node, text);
            },
            CallExpression(p) {
                const callee = p.node.callee;
                const isToast = (callee.type === 'MemberExpression' && callee.object.name === 'toast') || callee.name === 'toast';
                const isAlert = callee.type === 'MemberExpression' && callee.object.name === 'Alert' && callee.property.name === 'alert';
                if (!isToast && !isAlert) return;
                for (const arg of p.node.arguments) {
                    const text = literalText(arg);
                    if (text !== null && hasLetters(text)) report(arg, text);
                }
            },
            // Text chosen by a ternary or fallback, e.g. {isOnline ? 'Online' : 'Offline'} or title || 'Choose an option'
            'ConditionalExpression|LogicalExpression'(p) {
                const parent = p.parentPath;
                const attr = parent.isJSXExpressionContainer() && parent.parentPath.isJSXAttribute() ? parent.parentPath : null;
                const isChild = parent.isJSXExpressionContainer() && !attr;
                const isTextProp = (attr && TEXT_PROPS.has(attr.node.name.name)) || (parent.isObjectProperty() && TEXT_PROPS.has(parent.node.key.name));
                const isCallArg = parent.isCallExpression();
                if (!isChild && !isTextProp && !isCallArg && !p.isLogicalExpression()) return;
                const branches = p.isConditionalExpression() ? [p.node.consequent, p.node.alternate] : [p.node.right];
                for (const branch of branches) {
                    const text = literalText(branch);
                    if (text === null || !hasLetters(text) || text.startsWith('$')) continue;
                    const looksLikeSentence = /^[A-Z][A-Za-z' -]*[.!?]?$/.test(text.trim()) || text.trim() === 'N/A';
                    if (p.isLogicalExpression() && !looksLikeSentence) continue;
                    if (p.isConditionalExpression() && !isChild && !isTextProp && !isCallArg) continue;
                    report(branch, text);
                }
            },
        });
    }
    return found;
}

function findHardcodedStrings() {
    return listFiles(SRC).flatMap((file) => {
        const rel = path.relative(SRC, file).split(path.sep).join('/');
        if (EXCLUDED.some((ex) => rel === ex || (ex.endsWith('/') && rel.startsWith(ex)))) return [];
        return findInSource(fs.readFileSync(file, 'utf8'), rel);
    });
}

module.exports = { findHardcodedStrings, findInSource, listFiles, EXCLUDED, SRC };

if (require.main === module) {
    const found = findHardcodedStrings();
    for (const f of found) console.log(`${f.file}:${f.line}\t${f.text}`);
    console.log(`\n${found.length} hard-coded strings`);
}
