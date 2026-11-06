import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { useTranslation } from '../v3/i18n/useTranslation';

type Code = { value?: string; type: string };

type QrCodeScannerProps = {
    // The scanner's result object, not a string: read `code.value` for the scanned text.
    onScan: (code: Code, codes: Code[]) => void;
    width?: number | string;
    height?: number | string;
    overlayStyle?: object;
    scanCooldown?: number; // ms before allowing next scan
};

/*
 * The browser's scanner. Fleetbase labels print a QR code and a Code 128 barcode,
 * as in QrCodeScanner.tsx. BarcodeDetector is missing from Safari and Firefox, so
 * decoding runs in JavaScript everywhere rather than differing by browser.
 */
export const QrCodeScanner: React.FC<QrCodeScannerProps> = ({ onScan, width = '100%', height = '100%', overlayStyle = {}, scanCooldown = 3000 }) => {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const lastScanAt = useRef(0);
    const latestOnScan = useRef(onScan);
    latestOnScan.current = onScan;
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128]]]);
        const reader = new BrowserMultiFormatReader(hints);
        let stopped = false;
        let controls: { stop: () => void } | undefined;

        reader
            .decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, videoRef.current as HTMLVideoElement, (result) => {
                if (!result || Date.now() - lastScanAt.current < scanCooldown) return;
                lastScanAt.current = Date.now();
                const type = result.getBarcodeFormat() === BarcodeFormat.QR_CODE ? 'qr' : 'code-128';
                const code = { value: result.getText(), type };
                latestOnScan.current(code, [code]);
            })
            .then((started) => {
                if (stopped) started.stop();
                else controls = started;
            })
            .catch(() => setFailed(true));

        return () => {
            stopped = true;
            controls?.stop();
        };
    }, [scanCooldown]);

    return (
        <View style={[{ width, height, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' } as object, overlayStyle]}>
            <video ref={videoRef} muted playsInline autoPlay style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} />
            {/* Narrow enough to sit inside the overlay's viewfinder frame. */}
            {failed ? <Text style={{ color: '#fff', fontSize: 13, textAlign: 'center', paddingHorizontal: 88 }}>{t('camera.scanUnavailable')}</Text> : null}
        </View>
    );
};

export default QrCodeScanner;
