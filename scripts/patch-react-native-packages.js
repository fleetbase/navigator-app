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

const imageResizerHeader = path.join(
    __dirname,
    '..',
    'node_modules',
    '@bam.tech',
    'react-native-image-resizer',
    'ios',
    'ImageResizer.h'
);

const imageResizerSource = path.join(
    __dirname,
    '..',
    'node_modules',
    '@bam.tech',
    'react-native-image-resizer',
    'ios',
    'ImageResizer.mm'
);

const imageResizerEntrypoints = [
    path.join(__dirname, '..', 'node_modules', '@bam.tech', 'react-native-image-resizer', 'src', 'index.tsx'),
    path.join(__dirname, '..', 'node_modules', '@bam.tech', 'react-native-image-resizer', 'lib', 'commonjs', 'index.js'),
    path.join(__dirname, '..', 'node_modules', '@bam.tech', 'react-native-image-resizer', 'lib', 'module', 'index.js'),
];

const reactNativeBlurPodspec = path.join(
    __dirname,
    '..',
    'node_modules',
    '@react-native-community',
    'blur',
    'react-native-blur.podspec'
);

const reactNativeBlurHeader = path.join(
    __dirname,
    '..',
    'node_modules',
    '@react-native-community',
    'blur',
    'ios',
    'BlurView.h'
);

const reactNativeBlurSources = [
    path.join(__dirname, '..', 'node_modules', '@react-native-community', 'blur', 'ios', 'BlurView.mm'),
    path.join(__dirname, '..', 'node_modules', '@react-native-community', 'blur', 'ios', 'VibrancyView.mm'),
];

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

const reactNativeReanimatedBuildGradle = path.join(
    __dirname,
    '..',
    'node_modules',
    'react-native-reanimated',
    'android',
    'build.gradle.kts'
);

const reactNativeWorkletsBuildGradle = path.join(
    __dirname,
    '..',
    'node_modules',
    'react-native-worklets',
    'android',
    'build.gradle.kts'
);

const staleCodegenPackageJsons = [
    path.join(__dirname, '..', 'node_modules', '@bam.tech', 'react-native-image-resizer', 'package.json'),
    path.join(__dirname, '..', 'node_modules', '@react-native-community', 'blur', 'package.json'),
];

const kotlinGradleNodeResolver = `fun resolveNodeExecutable(): String {
    val nodeBinary = System.getenv("NODE_BINARY")
    if (!nodeBinary.isNullOrBlank()) {
        return nodeBinary
    }

    val candidatePaths = listOf(
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node"
    )

    return candidatePaths.firstOrNull { File(it).exists() } ?: "node"
}

`;

function patchImageResizerPodspec() {
    if (!fs.existsSync(imageResizerPodspec)) {
        return;
    }

    let podspec = fs.readFileSync(imageResizerPodspec, 'utf8');
    const original = podspec;

    for (const dependency of staleImageResizerDependencies) {
        podspec = podspec.replace(dependency, '');
    }

    podspec = podspec.replace(
        `  # Don't install the dependencies when we run \`pod install\` in the old architecture.
  if ENV['RCT_NEW_ARCH_ENABLED'] == '1' then
    s.compiler_flags = folly_compiler_flags + " -DRCT_NEW_ARCH_ENABLED=1"
    s.pod_target_xcconfig    = {
        "HEADER_SEARCH_PATHS" => "\\"$(PODS_ROOT)/boost\\"",
        "OTHER_CPLUSPLUSFLAGS" => "-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1",
        "CLANG_CXX_LANGUAGE_STANDARD" => "c++17"
    }
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"
  end
`,
        `  s.dependency "React-Core"
`
    );

    if (podspec !== original) {
        fs.writeFileSync(imageResizerPodspec, podspec);
        console.log('Patched @bam.tech/react-native-image-resizer podspec for legacy bridge mode.');
    }
}

function patchImageResizerIOSBridgeMode() {
    if (fs.existsSync(imageResizerHeader)) {
        let header = fs.readFileSync(imageResizerHeader, 'utf8');
        const original = header;

        header = header.replace(
            `#ifdef RCT_NEW_ARCH_ENABLED
#import "RNImageResizerSpec.h"
#else
#import <React/RCTBridgeModule.h>
#endif

#ifdef RCT_NEW_ARCH_ENABLED
@interface ImageResizer : NSObject <NativeImageResizerSpec>
#else
@interface ImageResizer : NSObject <RCTBridgeModule>
#endif

@end
`,
            `#import <React/RCTBridgeModule.h>

@interface ImageResizer : NSObject <RCTBridgeModule>

@end
`
        );

        if (header !== original) {
            fs.writeFileSync(imageResizerHeader, header);
            console.log('Patched @bam.tech/react-native-image-resizer iOS header for legacy bridge mode.');
        }
    }

    if (fs.existsSync(imageResizerSource)) {
        let source = fs.readFileSync(imageResizerSource, 'utf8');
        const original = source;

        source = source.replace(
            `
// Don't compile this code when we build for the old architecture.
#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
(const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeImageResizerSpecJSI>(params);
}
#endif
`,
            '\n'
        );

        if (source !== original) {
            fs.writeFileSync(imageResizerSource, source);
            console.log('Patched @bam.tech/react-native-image-resizer iOS source for legacy bridge mode.');
        }
    }
}

function patchImageResizerJSEntrypoints() {
    for (const entrypoint of imageResizerEntrypoints) {
        if (!fs.existsSync(entrypoint)) {
            continue;
        }

        let source = fs.readFileSync(entrypoint, 'utf8');
        const original = source;

        source = source
            .replace(
                `// @ts-expect-error
const isTurboModuleEnabled = global.__turboModuleProxy != null;
const ImageResizer = isTurboModuleEnabled ? require('./NativeImageResizer').default : _reactNative.NativeModules.ImageResizer;`,
                'const ImageResizer = _reactNative.NativeModules.ImageResizer;'
            )
            .replace(
                `// @ts-expect-error
const isTurboModuleEnabled = global.__turboModuleProxy != null;
const ImageResizer = isTurboModuleEnabled ? require('./NativeImageResizer').default : NativeModules.ImageResizer;`,
                'const ImageResizer = NativeModules.ImageResizer;'
            )
            .replace(
                `// @ts-expect-error
const isTurboModuleEnabled = global.__turboModuleProxy != null;

const ImageResizer = isTurboModuleEnabled
  ? require('./NativeImageResizer').default
  : NativeModules.ImageResizer;`,
                'const ImageResizer = NativeModules.ImageResizer;'
            );

        if (source !== original) {
            fs.writeFileSync(entrypoint, source);
            console.log(`Patched @bam.tech/react-native-image-resizer JS entrypoint: ${path.relative(process.cwd(), entrypoint)}.`);
        }
    }
}

function patchReactNativeBlurPodspec() {
    if (!fs.existsSync(reactNativeBlurPodspec)) {
        return;
    }

    let podspec = fs.readFileSync(reactNativeBlurPodspec, 'utf8');
    const original = podspec;

    podspec = podspec.replace(
        `  if defined?(install_modules_dependencies()) != nil
    install_modules_dependencies(s)
  else
    # Don't install the dependencies when we run \`pod install\` in the old architecture.
    if new_arch_enabled then
      folly_compiler_flags = '-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1 -Wno-comma -Wno-shorten-64-to-32'

      s.compiler_flags = folly_compiler_flags + " -DRCT_NEW_ARCH_ENABLED=1"
      s.pod_target_xcconfig    = {
          "HEADER_SEARCH_PATHS" => "\\"$(PODS_ROOT)/boost\\"",
          "CLANG_CXX_LANGUAGE_STANDARD" => "c++17"
      }

      s.dependency "React-RCTFabric"
      s.dependency "React-Codegen"
      s.dependency "RCT-Folly"
      s.dependency "RCTRequired"
      s.dependency "RCTTypeSafety"
      s.dependency "ReactCommon/turbomodule/core"
    else
      s.dependency "React-Core"
    end
  end
`,
        `  s.dependency "React-Core"
`
    );
    podspec = podspec.replace("\nnew_arch_enabled = ENV['RCT_NEW_ARCH_ENABLED'] == '1'\n", '\n');

    if (podspec !== original) {
        fs.writeFileSync(reactNativeBlurPodspec, podspec);
        console.log('Patched @react-native-community/blur podspec for legacy bridge mode.');
    }
}

function patchReactNativeBlurIOSBridgeMode() {
    if (fs.existsSync(reactNativeBlurHeader)) {
        let header = fs.readFileSync(reactNativeBlurHeader, 'utf8');
        const original = header;

        header = header.replace(
            `#import <UIKit/UIKit.h>
#import "BlurEffectWithAmount.h"

#ifdef RCT_NEW_ARCH_ENABLED
#import <React/RCTViewComponentView.h>
#endif // RCT_NEW_ARCH_ENABLED

@interface BlurView :
#ifdef RCT_NEW_ARCH_ENABLED
    RCTViewComponentView
#else
    UIView
#endif // RCT_NEW_ARCH_ENABLED
`,
            `#import <UIKit/UIKit.h>
#import "BlurEffectWithAmount.h"

@interface BlurView : UIView
`
        );

        if (header !== original) {
            fs.writeFileSync(reactNativeBlurHeader, header);
            console.log('Patched @react-native-community/blur iOS header for legacy bridge mode.');
        }
    }

    for (const sourcePath of reactNativeBlurSources) {
        if (!fs.existsSync(sourcePath)) {
            continue;
        }

        let source = fs.readFileSync(sourcePath, 'utf8');
        const original = source;

        source = source
            .replace(
                /\n#ifdef RCT_NEW_ARCH_ENABLED\n#import <React\/RCTConversions\.h>\n#import <React\/RCTFabricComponentsPlugins\.h>\n#import <react\/renderer\/components\/rnblurview\/ComponentDescriptors\.h>\n#import <react\/renderer\/components\/rnblurview\/Props\.h>\n#import <react\/renderer\/components\/rnblurview\/RCTComponentViewHelpers\.h>\n#endif \/\/ RCT_NEW_ARCH_ENABLED\n/g,
                '\n'
            )
            .replace(/\n#ifdef RCT_NEW_ARCH_ENABLED\nusing namespace facebook::react;\n\n@interface BlurView \(\) <RCTBlurViewViewProtocol>\n#else\n@interface BlurView \(\)\n#endif \/\/ RCT_NEW_ARCH_ENABLED\n/g, '\n@interface BlurView ()\n')
            .replace(/\n#ifdef RCT_NEW_ARCH_ENABLED\nusing namespace facebook::react;\n\n@interface VibrancyView \(\) <RCTVibrancyViewViewProtocol>\n#else\n@interface VibrancyView \(\)\n#endif \/\/ RCT_NEW_ARCH_ENABLED\n/g, '\n@interface VibrancyView ()\n')
            .replace(/\n#ifdef RCT_NEW_ARCH_ENABLED\n    static const auto defaultProps = std::make_shared<const BlurViewProps>\(\);\n    _props = defaultProps;\n#endif \/\/ RCT_NEW_ARCH_ENABLED\n/g, '\n')
            .replace(/\n#ifdef RCT_NEW_ARCH_ENABLED\n#pragma mark - RCTComponentViewProtocol\n\n\+ \(ComponentDescriptorProvider\)componentDescriptorProvider\n\{\n  return concreteComponentDescriptorProvider<BlurViewComponentDescriptor>\(\);\n\}\n\n- \(void\)updateProps:\(Props::Shared const &\)props oldProps:\(Props::Shared const &\)oldProps\n\{\n  const auto &oldViewProps = \*std::static_pointer_cast<const BlurViewProps>\(_props\);\n  const auto &newViewProps = \*std::static_pointer_cast<const BlurViewProps>\(props\);\n  \n  if \(oldViewProps\.blurAmount != newViewProps\.blurAmount\) \{\n    NSNumber \*blurAmount = \[NSNumber numberWithInt:newViewProps\.blurAmount\];\n    \[self setBlurAmount:blurAmount\];\n  \}\n\n  if \(oldViewProps\.blurType != newViewProps\.blurType\) \{\n    NSString \*blurType = \[NSString stringWithUTF8String:toString\(newViewProps\.blurType\)\.c_str\(\)\];\n    \[self setBlurType:blurType\];\n  \}\n  \n  if \(oldViewProps\.reducedTransparencyFallbackColor != newViewProps\.reducedTransparencyFallbackColor\) \{\n    UIColor \*color = RCTUIColorFromSharedColor\(newViewProps\.reducedTransparencyFallbackColor\);\n    \[self setReducedTransparencyFallbackColor:color\];\n  \}\n  \n  \[super updateProps:props oldProps:oldProps\];\n\}\n#endif \/\/ RCT_NEW_ARCH_ENABLED\n/g, '\n')
            .replace(/\n#ifdef RCT_NEW_ARCH_ENABLED\n#pragma mark - RCTComponentViewProtocol\n\n\+ \(ComponentDescriptorProvider\)componentDescriptorProvider\n\{\n  return concreteComponentDescriptorProvider<VibrancyViewComponentDescriptor>\(\);\n\}\n\n- \(void\)mountChildComponentView:\(UIView<RCTComponentViewProtocol> \*\)childComponentView index:\(NSInteger\)index\n\{\n  \[self attachToVisualEffectView:childComponentView\];\n\}\n\n- \(void\)unmountChildComponentView:\(UIView<RCTComponentViewProtocol> \*\)childComponentView index:\(NSInteger\)index\n\{\n  \/\/ Override unmountChildComponentView to avoid an assertion on childComponentView\.superview == self\n  \/\/ childComponentView is not a direct subview of self, as it's inserted deeper in a UIVisualEffectView\n  \[childComponentView removeFromSuperview\];\n\}\n#endif \/\/ RCT_NEW_ARCH_ENABLED\n/g, '\n')
            .replace(/\n#ifdef RCT_NEW_ARCH_ENABLED\nClass<RCTComponentViewProtocol> BlurViewCls\(void\)\n\{\n  return BlurView\.class;\n\}\n#endif \/\/ RCT_NEW_ARCH_ENABLED\n/g, '\n')
            .replace(/\n#ifdef RCT_NEW_ARCH_ENABLED\nClass<RCTComponentViewProtocol> VibrancyViewCls\(void\)\n\{\n  return VibrancyView\.class;\n\}\n#endif \/\/ RCT_NEW_ARCH_ENABLED\n/g, '\n');

        if (source !== original) {
            fs.writeFileSync(sourcePath, source);
            console.log(`Patched @react-native-community/blur iOS source: ${path.relative(process.cwd(), sourcePath)}.`);
        }
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

function patchKotlinGradleNodeResolution(buildGradlePath, packageName) {
    if (!fs.existsSync(buildGradlePath)) {
        return;
    }

    let buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
    const original = buildGradle;

    if (!buildGradle.includes('fun resolveNodeExecutable(): String')) {
        buildGradle = buildGradle.replace(
            'fun safeExtGet(prop: String, fallback: Any?): Any? =\n',
            `${kotlinGradleNodeResolver}fun safeExtGet(prop: String, fallback: Any?): Any? =\n`
        );
    }

    buildGradle = buildGradle.replaceAll(
        'commandLine("node",',
        'commandLine(resolveNodeExecutable(),'
    );

    if (buildGradle !== original) {
        fs.writeFileSync(buildGradlePath, buildGradle);
        console.log(`Patched ${packageName} Android Gradle node resolution.`);
    }
}

patchImageResizerPodspec();
patchImageResizerIOSBridgeMode();
patchImageResizerJSEntrypoints();
patchReactNativeBlurPodspec();
patchReactNativeBlurIOSBridgeMode();
patchReactNativeI18nGradle();
patchStaleCodegenPackageJsons();
patchReactNativeNotificationsFcmToken();
patchKotlinGradleNodeResolution(reactNativeReanimatedBuildGradle, 'react-native-reanimated');
patchKotlinGradleNodeResolution(reactNativeWorkletsBuildGradle, 'react-native-worklets');
