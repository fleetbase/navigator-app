import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View, Text } from 'react-native';
import { Camera, useCameraDevice, useCodeScanner, type Code } from 'react-native-vision-camera';
import { useCameraActive } from '../hooks/use-camera-active';

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
    // Told where the camera has got to, so the host can say it instead of showing black:
    //   'starting'     allowed (or being asked for) and not yet giving a picture
    //   'ready'        the camera says it is running
    //   'stalled'      it has not started within a few seconds of being in front, or it
    //                  reported an error (`detail` is the error's code, when there is one)
    //   'denied'       the driver has not allowed the camera
    //   'unavailable'  this phone has no back camera
    onCameraState?: (state: QrCameraState, detail?: string) => void;
    // The host's own reason to stop the camera. The scanner already stops while its screen
    // is not the one in front and while the app is in the background.
    active?: boolean;
};

export type QrCameraState = 'starting' | 'ready' | 'stalled' | 'denied' | 'unavailable';

/** How long the camera is given to start, once it is in front, before the host is told it has stalled. */
const START_MS = 3000;

type Permission = 'unknown' | 'granted' | 'denied';

// vision-camera 4 answers 'granted'; 'authorized' was the word before it.
const permissionOf = (status: unknown): Permission => (status === 'granted' || status === 'authorized' ? 'granted' : status === 'not-determined' ? 'unknown' : 'denied');

/** What the phone already says, with no waiting: a driver who allowed the camera before is not left on "unknown". */
const permissionNow = (): Permission => {
    try {
        return permissionOf(Camera.getCameraPermissionStatus());
    } catch {
        return 'unknown';
    }
};

export const QrCodeScanner: React.FC<QrCodeScannerProps> = ({ onScan, width = '100%', height = '100%', overlayStyle = {}, frame = true, scanCooldown = 3000, torch = false, onTorchAvailable, onCameraState, active = true }) => {
    const device = useCameraDevice('back');
    const [isScanning, setIsScanning] = useState(true);
    const [permission, setPermission] = useState<Permission>(permissionNow);
    const cooldownRef = useRef<NodeJS.Timeout | null>(null);
    // Running only while this screen is in front and the app is in the foreground: a camera
    // left running underneath keeps the capture session, and the next one to open shows black.
    const inFront = useCameraActive();
    const live = active && inFront;
    // The camera's own word that it is running, and that it is not.
    const [started, setStarted] = useState(false);
    const startedRef = useRef(false);
    const [stalled, setStalled] = useState<{ detail?: string } | null>(null);
    const markStarted = () => {
        startedRef.current = true;
        setStarted(true);
        setStalled(null);
    };
    const markStopped = () => {
        startedRef.current = false;
        setStarted(false);
    };

    useEffect(() => {
        let alive = true;
        (async () => {
            // Asked only when the phone has not already said yes.
            if (permissionNow() === 'granted') {
                if (alive) setPermission('granted');
                return;
            }
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
    // Something is still expected of the camera: it exists, and the driver has not refused it.
    const awaited = hasDevice && permission !== 'denied';
    const cameraState: QrCameraState = permission === 'denied' ? 'denied' : !hasDevice ? 'unavailable' : started ? 'ready' : stalled ? 'stalled' : 'starting';
    const stalledDetail = stalled?.detail;

    /*
     * A camera that is in front and still has not said it is running after a
     * few seconds has stalled: the host is told, so the driver sees a notice
     * and a way on instead of a black screen. That covers a permission answer
     * that never arrives as well as a camera that never starts. Out of sight
     * it is not counted (it is not meant to run there, and the phone's own
     * permission question puts the app out of the foreground), and the count
     * starts again when it comes back.
     */
    useEffect(() => {
        if (!live) {
            setStalled(null);
            return undefined;
        }
        if (!awaited || started) return undefined;
        const timer = setTimeout(() => {
            if (!startedRef.current) setStalled((was) => was ?? {});
        }, START_MS);
        return () => clearTimeout(timer);
    }, [live, awaited, started]);

    // The host's callbacks are read through refs, so an inline function does not re-run these.
    const onCameraStateRef = useRef(onCameraState);
    onCameraStateRef.current = onCameraState;
    const onTorchAvailableRef = useRef(onTorchAvailable);
    onTorchAvailableRef.current = onTorchAvailable;

    useEffect(() => {
        onCameraStateRef.current?.(cameraState, cameraState === 'stalled' ? stalledDetail : undefined);
    }, [cameraState, stalledDetail]);

    useEffect(() => {
        onTorchAvailableRef.current?.(hasTorch && permission !== 'denied');
    }, [hasTorch, permission]);

    const codeScanner = useCodeScanner({
        // Fleetbase labels print a QR code (a tracking url, or the owner uuid on older
        // labels) and a Code 128 barcode (the bare tracking number). capture-qr accepts
        // all of them, so either one on the label is enough.
        codeTypes: ['qr', 'code-128'],
        onCodeScanned: (codes) => {
            // A code was read, so the camera is running, whatever it has or has not said.
            if (codes.length > 0 && !startedRef.current) markStarted();
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

    if (permission !== 'granted') {
        /*
         * Still being asked. The camera is not mounted until the answer is yes:
         * one mounted while the question is on screen fails for want of
         * permission and does not start again when it is given.
         */
        return <View style={[styles.noCamera, { width, height }]} />;
    }

    return (
        <View style={[styles.cameraGround, { width, height }]}>
            <Camera
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={live}
                codeScanner={codeScanner}
                torch={live && torch && hasTorch ? 'on' : 'off'}
                onStarted={markStarted}
                onPreviewStarted={markStarted}
                onStopped={markStopped}
                onError={(error) => {
                    // Said in the Metro log too, so a camera that will not start can be reported with its reason.
                    console.warn(`[scanner] camera error: ${error?.code ?? 'unknown'}: ${error?.message ?? ''}`);
                    if (!startedRef.current) setStalled({ detail: error?.code ? String(error.code) : undefined });
                }}
            />
            {/* A host that is told the camera's state says this in its own words. */}
            {stalled && !started && !onCameraState ? (
                <View pointerEvents='none' style={styles.overlayContainer}>
                    <Text style={styles.stalledText}>The camera is taking a while to start</Text>
                </View>
            ) : null}
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
    cameraGround: {
        backgroundColor: '#000',
    },
    stalledText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center',
        paddingHorizontal: 24,
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
