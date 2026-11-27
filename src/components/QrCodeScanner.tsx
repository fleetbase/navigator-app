import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View, Text } from 'react-native';
import { Camera, useCameraDevice, useCodeScanner, type Code } from 'react-native-vision-camera';

type QrCodeScannerProps = {
    // The scanner's result object, not a string: read `code.value` for the scanned text.
    onScan: (code: Code, codes: Code[]) => void;
    width?: number | string;
    height?: number | string;
    overlayStyle?: object;
    // The scanner's own dashed aiming box. The v3 screens draw their own scan frame over
    // the camera and pass `frame={false}`, so only one frame is ever on screen.
    frame?: boolean;
    scanCooldown?: number; // ms before allowing next scan
    // The phone's light, for a label in a dark van. Ignored on a camera that has none.
    torch?: boolean;
    // Told whether this camera has a light at all, so the host shows a torch button only when it does.
    onTorchAvailable?: (available: boolean) => void;
    // Told what the camera can do: 'ready', 'denied' (the driver has not allowed the camera)
    // or 'unavailable' (this phone has no back camera). The host says what to do about it.
    onCameraState?: (state: QrCameraState) => void;
};

export type QrCameraState = 'ready' | 'denied' | 'unavailable';

type Permission = 'unknown' | 'granted' | 'denied';

// vision-camera 4 answers 'granted'; 'authorized' was the word before it.
const permissionOf = (status: unknown): Permission => (status === 'granted' || status === 'authorized' ? 'granted' : status === 'not-determined' ? 'unknown' : 'denied');

export const QrCodeScanner: React.FC<QrCodeScannerProps> = ({ onScan, width = '100%', height = '100%', overlayStyle = {}, frame = true, scanCooldown = 3000, torch = false, onTorchAvailable, onCameraState }) => {
    const device = useCameraDevice('back');
    const [isScanning, setIsScanning] = useState(true);
    const [permission, setPermission] = useState<Permission>('unknown');
    const cooldownRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const status = await Camera.requestCameraPermission();
                if (alive) setPermission(permissionOf(status));
            } catch {
                if (alive) setPermission('denied');
            }
        })();

        // Back from the phone's Settings, where the driver may just have allowed the camera.
        const subscription = AppState.addEventListener('change', (next) => {
            if (next !== 'active') return;
            try {
                const status = permissionOf(Camera.getCameraPermissionStatus());
                if (alive && status !== 'unknown') setPermission(status);
            } catch {
                // Left as it was: the next request answers.
            }
        });

        return () => {
            alive = false;
            subscription.remove();
            if (cooldownRef.current) {
                clearTimeout(cooldownRef.current);
            }
        };
    }, []);

    const hasDevice = !!device;
    const hasTorch = !!device?.hasTorch;
    const cameraState: QrCameraState | null = permission === 'denied' ? 'denied' : !hasDevice ? 'unavailable' : permission === 'granted' ? 'ready' : null;

    // The host's callbacks are read through refs, so an inline function does not re-run these.
    const onCameraStateRef = useRef(onCameraState);
    onCameraStateRef.current = onCameraState;
    const onTorchAvailableRef = useRef(onTorchAvailable);
    onTorchAvailableRef.current = onTorchAvailable;

    useEffect(() => {
        if (cameraState) onCameraStateRef.current?.(cameraState);
    }, [cameraState]);

    useEffect(() => {
        onTorchAvailableRef.current?.(hasTorch && permission !== 'denied');
    }, [hasTorch, permission]);

    const codeScanner = useCodeScanner({
        // Fleetbase labels print a QR code (a tracking url, or the owner uuid on older
        // labels) and a Code 128 barcode (the bare tracking number). capture-qr accepts
        // all of them, so either one on the label is enough.
        codeTypes: ['qr', 'code-128'],
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
                {/* A host that is told the camera's state says this in its own words. */}
                {onCameraState ? null : <Text style={{ color: '#fff' }}>No camera available</Text>}
            </View>
        );
    }

    if (permission === 'denied') {
        // Nothing to show without the camera; the host says what to do (see `onCameraState`).
        return <View style={[styles.noCamera, { width, height }]} />;
    }

    return (
        <View style={{ width, height }}>
            <Camera style={StyleSheet.absoluteFill} device={device} isActive={true} codeScanner={codeScanner} torch={torch && hasTorch ? 'on' : 'off'} />
            {frame ? (
                <View pointerEvents='none' style={styles.overlayContainer}>
                    <View style={[styles.overlayBox, overlayStyle]} />
                </View>
            ) : null}
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
        // Written out: the style sheet's absolute-fill object no longer exists in this React Native.
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
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
