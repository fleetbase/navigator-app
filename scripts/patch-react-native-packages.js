const fs = require('fs');
const path = require('path');

const imageResizerPodspec = path.join(
    __dirname,
    '..',
    'node_modules',
    '@bam.tech',
    'react-native-image-resizer',
    'react-native-image-resizer.podspec'
);

const staleImageResizerDependencies = [
    '    s.dependency "React-Codegen"\n',
    '    s.dependency "RCT-Folly"\n',
    '    s.dependency "RCTRequired"\n',
    '    s.dependency "RCTTypeSafety"\n',
    '    s.dependency "ReactCommon/turbomodule/core"\n',
];

const reactNativeI18nBuildGradle = path.join(
    __dirname,
    '..',
    'node_modules',
    'react-native-i18n',
    'android',
    'build.gradle'
);

const reactNativeNotificationsFcmToken = path.join(
    __dirname,
    '..',
    'node_modules',
    'react-native-notifications',
    'lib',
    'android',
    'app',
    'src',
    'main',
    'java',
    'com',
    'wix',
    'reactnativenotifications',
    'fcm',
    'FcmToken.java'
);

const staleCodegenPackageJsons = [
    path.join(__dirname, '..', 'node_modules', '@bam.tech', 'react-native-image-resizer', 'package.json'),
    path.join(__dirname, '..', 'node_modules', '@react-native-community', 'blur', 'package.json'),
];

function patchImageResizerPodspec() {
    if (!fs.existsSync(imageResizerPodspec)) {
        return;
    }

    let podspec = fs.readFileSync(imageResizerPodspec, 'utf8');
    const original = podspec;

    for (const dependency of staleImageResizerDependencies) {
        podspec = podspec.replace(dependency, '');
    }

    if (podspec !== original) {
        fs.writeFileSync(imageResizerPodspec, podspec);
        console.log('Patched @bam.tech/react-native-image-resizer podspec for React Native 0.86.');
    }
}

function patchReactNativeI18nGradle() {
    if (!fs.existsSync(reactNativeI18nBuildGradle)) {
        return;
    }

    let buildGradle = fs.readFileSync(reactNativeI18nBuildGradle, 'utf8');
    const original = buildGradle;

    buildGradle = buildGradle.replace(
        '  compile "com.facebook.react:react-native:+" // From node_modules',
        '  implementation "com.facebook.react:react-native:+" // From node_modules'
    );

    if (buildGradle !== original) {
        fs.writeFileSync(reactNativeI18nBuildGradle, buildGradle);
        console.log('Patched react-native-i18n Android Gradle dependency configuration.');
    }
}

function patchStaleCodegenPackageJsons() {
    for (const packageJsonPath of staleCodegenPackageJsons) {
        if (!fs.existsSync(packageJsonPath)) {
            continue;
        }

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

        if (!packageJson.codegenConfig) {
            continue;
        }

        delete packageJson.codegenConfig;
        fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
        console.log(`Removed stale React Native codegen config from ${packageJson.name}.`);
    }
}

function patchReactNativeNotificationsFcmToken() {
    if (!fs.existsSync(reactNativeNotificationsFcmToken)) {
        return;
    }

    let fcmToken = fs.readFileSync(reactNativeNotificationsFcmToken, 'utf8');
    const original = fcmToken;

    fcmToken = fcmToken.replace(
        `    protected void sendTokenToJS() {
        final ReactInstanceManager instanceManager = ((ReactApplication) mAppContext).getReactNativeHost().getReactInstanceManager();
        ReactContext reactContext = instanceManager.getCurrentReactContext();

        if (reactContext == null) {
            // If the react context is not available, try to get the current context from the react host (RN0.76).
            reactContext = ((ReactApplication) mAppContext).getReactHost().getCurrentReactContext();
        }
        // Note: Cannot assume react-context exists cause this is an async dispatched service.
        if (reactContext != null && reactContext.hasActiveReactInstance()) {
            Bundle tokenMap = new Bundle();
            tokenMap.putString("deviceToken", sToken);
            mJsIOHelper.sendEventToJS(TOKEN_RECEIVED_EVENT_NAME, tokenMap, reactContext);
        }
    }
`,
        `    protected void sendTokenToJS() {
        ReactContext reactContext = null;

        try {
            reactContext = ((ReactApplication) mAppContext).getReactHost().getCurrentReactContext();
        } catch (UnsupportedOperationException ignored) {
            // Older React Native versions may not provide ReactHost.
        }

        if (reactContext == null) {
            try {
                final ReactInstanceManager instanceManager = ((ReactApplication) mAppContext).getReactNativeHost().getReactInstanceManager();
                reactContext = instanceManager.getCurrentReactContext();
            } catch (UnsupportedOperationException ignored) {
                // React Native 0.82+ no longer supports creating React contexts through ReactInstanceManager.
            }
        }

        // Note: Cannot assume react-context exists cause this is an async dispatched service.
        if (reactContext != null && reactContext.hasActiveReactInstance()) {
            Bundle tokenMap = new Bundle();
            tokenMap.putString("deviceToken", sToken);
            mJsIOHelper.sendEventToJS(TOKEN_RECEIVED_EVENT_NAME, tokenMap, reactContext);
        }
    }
`
    );

    if (fcmToken !== original) {
        fs.writeFileSync(reactNativeNotificationsFcmToken, fcmToken);
        console.log('Patched react-native-notifications FCM token delivery for React Native 0.86.');
    }
}

patchImageResizerPodspec();
patchReactNativeI18nGradle();
patchStaleCodegenPackageJsons();
patchReactNativeNotificationsFcmToken();
