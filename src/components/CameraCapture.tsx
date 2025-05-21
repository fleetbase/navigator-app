import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Dimensions, Platform } from 'react-native';
import { YStack, XStack, Button, Text, Image, Card, ScrollView } from 'tamagui';
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
import type { Camera as CameraRef } from 'react-native-vision-camera';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import RNFS from 'react-native-fs';
import useDimensions from '../hooks/use-dimensions';
import { toast, ToastPosition } from '../utils/toast';

const MENU_BAR_HEIGHT = 160;

interface CapturedPhoto {
    uri: string;
}

interface CameraCaptureScreenProps {
    onDone?: (photos: CapturedPhoto[]) => void;
}

const CameraCapture = ({ onDone }: CameraCaptureScreenProps) => {
    const cameraRef = useRef<CameraRef>(null);
    const device = useCameraDevice('back');
    const { screenHeight } = useDimensions();
    const [hasPermission, setHasPermission] = useState<boolean>(false);
    const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
    const [showGalleryOverlay, setShowGalleryOverlay] = useState<boolean>(false);
    const [flashOn, setFlashOn] = useState<boolean>(false);

    useEffect(() => {
        (async () => {
            const cameraPermission = await Camera.getCameraPermissionStatus();
            if (cameraPermission !== 'granted') {
                const newCameraPermission = await Camera.requestCameraPermission();
                setHasPermission(newCameraPermission === 'granted');
            } else {
                setHasPermission(true);
            }
        })();
    }, []);

    const handleTakePhoto = useCallback(async () => {
        if (!cameraRef.current) return;
        try {
            const photo = await cameraRef.current.takePhoto({
                flash: 'off',
                qualityPrioritization: 'balanced',
            });
            toast.info('Photo captured.', { position: ToastPosition.TOP });

            const filePath = (Platform.OS === 'ios' ? '' : 'file://') + photo.path;
            const base64Data = await RNFS.readFile(filePath, 'base64');
            const newCapturedPhoto = {
                uri: filePath,
                base64: base64Data,
            };

            setPhotos((prev) => [...prev, newCapturedPhoto]);
        } catch (error) {
            console.warn('Error taking photo:', error);
        }
    }, []);

    // Let the user pick images from their camera roll
    const handleSelectFromCameraRoll = useCallback(async () => {
        try {
            // Example: open system gallery multi-picker (this is up to you to implement).
            // You could also use a library like `react-native-image-crop-picker` or
            // a custom UI that fetches camera roll photos with CameraRoll.getPhotos.
            const photosFromGallery = await CameraRoll.getPhotos({
                first: 10, // e.g. fetch 10 photos
                assetType: 'Photos',
            });
            // For simplicity, let's just take the first photo (in a real scenario you'd present a UI).
            if (photosFromGallery.edges.length > 0) {
                const { node } = photosFromGallery.edges[0];
                toast.info('Photo added from gallery.', { position: ToastPosition.TOP });
                setPhotos((prev) => [...prev, { uri: node.image.uri }]);
            }
        } catch (error) {
            console.warn('Error selecting from camera roll:', error);
        }
    }, []);

    const openGalleryOverlay = () => setShowGalleryOverlay(true);
    const closeGalleryOverlay = () => setShowGalleryOverlay(false);

    const handleDeletePhoto = (index: number) => {
        setPhotos((prev) => {
            const newArr = [...prev];
            newArr.splice(index, 1);
            return newArr;
        });
    };

    const handleDone = () => {
        if (onDone) {
            onDone(photos);
        }
    };

    if (!device || !hasPermission) {
        return (
            <YStack flex={1} justifyContent='center' alignItems='center'>
                <Text color='$textSecondary'>Loading camera or awaiting permission...</Text>
            </YStack>
        );
    }

    return (
        <YStack flex={1}>
            <YStack flex={1} height={screenHeight - MENU_BAR_HEIGHT}>
                <Camera ref={cameraRef} style={{ flex: 1, width: '100%', height: '100%' }} device={device} isActive={true} photo={true} />
            </YStack>
            <YStack width='100%' height={MENU_BAR_HEIGHT} bg='$background' py='$3' space='$4' borderTopWidth={1} borderColor='$borderColorWithShadow'>
                <XStack ai='center' jc='space-between' px='$4'>
                    <Button onPress={handleSelectFromCameraRoll}>
                        <Button.Text>Gallery</Button.Text>
                    </Button>
                    <Button onPress={handleTakePhoto} size='$6' circular bg='$blue-500' borderWidth={5} borderColor='$blue-700'>
                        <Button.Text fontSize={14} color='$white'>
                            Snap
                        </Button.Text>
                    </Button>
                    <Button onPress={openGalleryOverlay}>
                        <Button.Text>{photos.length} Photos</Button.Text>
                    </Button>
                </XStack>
                <YStack px='$5'>
                    <Button width='100%' bg='$success' borderWidth={1} borderColor='$successBorder' onPress={handleDone}>
                        <Button.Text fontSize={15} color='$successText'>
                            Done
                        </Button.Text>
                    </Button>
                </YStack>
            </YStack>

            {showGalleryOverlay && (
                <YStack pos='absolute' top={0} left={0} w='100%' h='100%' bg='$surface' opacity={0.95}>
                    <XStack jc='flex-end' p='$4'>
                        <Button size='$3' onPress={closeGalleryOverlay} bg='$default' borderWidth={1} borderColor='$defaultBorder'>
                            <Button.Text color='$defaultText'>Close</Button.Text>
                        </Button>
                    </XStack>

                    <ScrollView showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
                        <XStack fw='wrap' jc='flex-start'>
                            {photos.map((photo, index) => (
                                <YStack key={index} mx='$3' my='$2'>
                                    <Card width={140} height={140}>
                                        <Image source={{ uri: photo.uri }} width={140} height={140} resizeMode='cover' borderRadius='$4' />
                                        <Button
                                            pos='absolute'
                                            top={0}
                                            right={0}
                                            mt={-7}
                                            mr={-7}
                                            bg='$error'
                                            borderWidth={1}
                                            borderColor='$errorBorder'
                                            circular
                                            size='$2'
                                            onPress={() => handleDeletePhoto(index)}
                                        >
                                            <Button.Text color='$errorText'>X</Button.Text>
                                        </Button>
                                    </Card>
                                </YStack>
                            ))}
                        </XStack>
                    </ScrollView>
                </YStack>
            )}
        </YStack>
    );
};

export default CameraCapture;
