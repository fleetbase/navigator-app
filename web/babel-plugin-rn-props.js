/**
 * React Native props that have no effect in a browser, rewritten so a screen needs
 * no platform branch to use them:
 *
 *  - `accessibilityState` and `accessibilityValue` reach neither Tamagui's nor
 *    react-native-web's DOM output, so they become ARIA attributes.
 *  - `start` and `end`, the logical offsets, become their CSS names. Tamagui would
 *    otherwise drop them and leave the element positioned by content.
 */
const HELPERS = { accessibilityState: '__ariaState', accessibilityValue: '__ariaValue' };
const RENAMED = { start: 'insetInlineStart', end: 'insetInlineEnd' };

module.exports = ({ types: t }) => ({
    name: 'react-native-props-for-web',
    visitor: {
        JSXAttribute(path) {
            const name = path.node.name.name;
            if (RENAMED[name]) {
                path.node.name = t.jsxIdentifier(RENAMED[name]);
                return;
            }
            if (HELPERS[name] && t.isJSXExpressionContainer(path.node.value)) {
                path.replaceWith(t.jsxSpreadAttribute(t.callExpression(t.identifier(HELPERS[name]), [path.node.value.expression])));
            }
        },
    },
});
