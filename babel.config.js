module.exports = {
    presets: ['module:metro-react-native-babel-preset'],
    plugins: [
        '@babel/plugin-proposal-async-generator-functions',
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
