/**
 * `extends: '@react-native-community'` referenced a package that is not
 * installed — the project depends on @react-native/eslint-config (the renamed
 * successor), so `yarn lint` failed before linting anything.
 */
module.exports = {
    root: true,
    extends: '@react-native',
    rules: {
        'react/prop-types': 'off',
    },
};
