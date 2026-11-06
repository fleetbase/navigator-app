import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '../v3/ui/Button';
import { Micro } from '../v3/ui/Text';
import { space } from '../v3/theme/tokens';
import { useTranslation } from '../v3/i18n/useTranslation';

export interface CapturedPhoto {
    uri: string;
    /** Base64 of the image, as on native: proof and defects are sent as base64. */
    base64?: string;
}

interface CameraCaptureScreenProps {
    onDone?: (photos: CapturedPhoto[]) => void;
}

// Enough to read a label or a defect; a full-size camera frame is several MB of base64.
const MAX_EDGE = 1600;

function toPhoto(source: CanvasImageSource, width: number, height: number): CapturedPhoto {
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
    const uri = canvas.toDataURL('image/jpeg', 0.82);
    return { uri, base64: uri.split(',')[1] };
}

const readFile = (file: File) =>
    new Promise<CapturedPhoto>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            resolve(toPhoto(image, image.naturalWidth, image.naturalHeight));
            URL.revokeObjectURL(url);
        };
        image.onerror = reject;
        image.src = url;
    });

const CameraCapture = ({ onDone }: CameraCaptureScreenProps) => {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraFailed, setCameraFailed] = useState(false);

    useEffect(() => {
        let stream: MediaStream | undefined;
        let stopped = false;
        navigator.mediaDevices
            ?.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
            .then((opened) => {
                if (stopped) {
                    opened.getTracks().forEach((track) => track.stop());
                    return;
                }
                stream = opened;
                if (videoRef.current) videoRef.current.srcObject = opened;
                setCameraReady(true);
            })
            .catch(() => setCameraFailed(true)) ?? setCameraFailed(true);
        return () => {
            stopped = true;
            stream?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    const takePhoto = useCallback(() => {
        const video = videoRef.current;
        if (!video?.videoWidth) return;
        const photo = toPhoto(video, video.videoWidth, video.videoHeight);
        setPhotos((previous) => [...previous, photo]);
    }, []);

    const addFiles = useCallback(async (files: FileList | null) => {
        if (!files?.length) return;
        const added = await Promise.all(Array.from(files).map(readFile));
        setPhotos((previous) => [...previous, ...added]);
    }, []);

    return (
        <View style={{ flex: 1, gap: space[2] }}>
            <View style={{ flex: 1, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                <video ref={videoRef} muted playsInline autoPlay style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} />
                {cameraFailed ? (
                    <Micro color="$white" textAlign="center" padding={space[4]}>
                        {t('camera.unavailable')}
                    </Micro>
                ) : null}
            </View>
            {photos.length ? (
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }} testID="camera-photos">
                    {photos.map((photo, index) => (
                        <Pressable key={index} accessibilityLabel={t('camera.removePhoto')} onPress={() => setPhotos((previous) => previous.filter((_, i) => i !== index))}>
                            <img src={photo.uri} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                        </Pressable>
                    ))}
                </View>
            ) : null}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => void addFiles(event.target.files)} />
            <View style={{ flexDirection: 'row', gap: space[2] }}>
                <Button flex={1} variant="secondary" onPress={() => fileRef.current?.click()} testID="camera-gallery">
                    {t('camera.gallery')}
                </Button>
                <Button flex={1} variant="secondary" disabled={!cameraReady} onPress={takePhoto} testID="camera-snap">
                    {t('camera.snap')}
                </Button>
                <Button flex={1} disabled={!photos.length} onPress={() => onDone?.(photos)} testID="camera-done">
                    {t('camera.done')}
                </Button>
            </View>
        </View>
    );
};

export default CameraCapture;
