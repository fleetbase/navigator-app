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

patchImageResizerPodspec();
