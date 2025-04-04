import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';

type QrCodeScannerProps = {
    onScan: (data: string) => void;
    width?: number | string;
    height?: number | string;
    overlayStyle?: object;
};

export const QrCodeScanner: React.FC<QrCodeScannerProps> = ({ onScan, width = '100%', height = '100%', overlayStyle = {} }) => {
    // Get available camera devices and select the front camera
    const device = useCameraDevice('back');

    useEffect(() => {
        (async () => {
            const status = await Camera.requestCameraPermission();
            cnsole.log('status', status);
            if (status !== 'authorized') {
                console.warn('Camera permission not granted');
            }
        })();
    }, []);

    const codeScanner = useCodeScanner({
        codeTypes: ['qr'],
        onCodeScanned: (codes) => {
            if (codes.length > 0) {
                const scanned = codes[0];
                if (typeof onScan === 'function') {
                    onScan(scanned, codes);
                }
            }
        },
    });

    if (!device) {
        return (
            <View style={[styles.noCamera, { width, height }]}>
                <Text style={{ color: '#fff' }}>No camera available</Text>
            </View>
        );
    }

    return (
        <View style={{ width, height }}>
            <Camera style={StyleSheet.absoluteFill} device={device} isActive={true} codeScanner={codeScanner} />
            <View pointerEvents='none' style={styles.overlayContainer}>
                <View style={[styles.overlayBox, overlayStyle]} />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    noCamera: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
    },
    overlayContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlayBox: {
        width: 150,
        height: 150,
        borderWidth: 3,
        borderStyle: 'dashed',
        borderColor: 'red',
        opacity: 0.75,
    },
});

export default QrCodeScanner;
