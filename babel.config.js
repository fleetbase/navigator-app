module.exports = {
    presets: ['module:metro-react-native-babel-preset'],
    plugins: [
        '@babel/plugin-transform-async-generator-functions',
        '@babel/plugin-transform-async-to-generator',
        'react-native-reanimated/plugin',
        'preval',
        [
            'module-resolver',
            {
                root: ['./src', './app'],
                extensions: ['.js', '.json'],
                alias: {
                    account: './src/features/Account',
                    auth: './src/features/Auth',
                    core: './src/features/Core',
                    exceptions: './src/features/Exceptions',
                    shared: './src/features/Shared',
                    ui: './src/interface',
                    components: './src/components',
                    assets: './assets',
                    app: './app'
                },
            },
        ],
    ],
};
