import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';

type QrCodeScannerProps = {
    onScan: (data: string) => void;
    width?: number | string;
    height?: number | string;
    overlayStyle?: object;
    scanCooldown?: number; // ms before allowing next scan
};

export const QrCodeScanner: React.FC<QrCodeScannerProps> = ({ onScan, width = '100%', height = '100%', overlayStyle = {}, scanCooldown = 3000 }) => {
    const device = useCameraDevice('back');
    const [isScanning, setIsScanning] = useState(true);
    const cooldownRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        (async () => {
            const status = await Camera.requestCameraPermission();
            if (status !== 'authorized') {
                console.warn('Camera permission not granted');
            }
        })();

        return () => {
            if (cooldownRef.current) {
                clearTimeout(cooldownRef.current);
            }
        };
    }, []);

    const codeScanner = useCodeScanner({
        codeTypes: ['qr'],
        onCodeScanned: (codes) => {
            if (!isScanning || codes.length === 0) return;

            const scanned = codes[0];
            setIsScanning(false);

            if (typeof onScan === 'function') {
                onScan(scanned, codes);
            }

            cooldownRef.current = setTimeout(() => {
                setIsScanning(true);
            }, scanCooldown);
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
