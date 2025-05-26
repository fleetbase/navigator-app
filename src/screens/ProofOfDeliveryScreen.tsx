import { useState, useRef, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Image, Text, YStack, XStack, Spinner, useTheme } from 'tamagui';
import { Order, Place } from '@fleetbase/sdk';
import { titleize } from 'inflected';
import { SectionHeader, SectionInfoLine } from '../components/Content';
import { isNone, resizePhoto } from '../utils';
import { toast } from '../utils/toast';
import { useTempStore } from '../contexts/TempStoreContext';
import useDimensions from '../hooks/use-dimensions';
import useFleetbase from '../hooks/use-fleetbase';
import useAppTheme from '../hooks/use-app-theme';
import QrCodeScanner from '../components/QrCodeScanner';
import CameraCapture from '../components/CameraCapture';
import BackButton from '../components/BackButton';
import CustomHeader from '../components/CustomHeader';
import LoadingOverlay from '../components/LoadingOverlay';
import SignatureCanvas from 'react-native-signature-canvas';

const ProofOfDeliveryScreen = ({ route }) => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { isDarkMode } = useAppTheme();
    const { adapter } = useFleetbase();
    const { setValue } = useTempStore();
    const { screenWidth, screenHeight } = useDimensions();
    const [isLoading, setIsLoading] = useState(false);
    const [loadingOverlayMessage, setLoadingOverlayMessage] = useState('Capturing Proof of Delivery...');
    const signatureScreenRef = useRef();
    const params = route.params ?? {};
    const activity = params.activity;
    const order = new Order(params.order, adapter);
    const waypoint = new Place(params.waypoint, adapter);
    const entity = params.entity;
    const method = activity.pod_method;
    const isWaypointActivity = waypoint && typeof waypoint.getAttribute('tracking') === 'string' && waypoint.getAttribute('tracking').length;
    const subject = entity ?? (isWaypointActivity ? waypoint : order);

    const signatureWebStyle = `.m-signature-pad { box-shadow: none; border: none; }
              .m-signature-pad--body { border: none; }
              .m-signature-pad--footer { position: absolute; bottom: 0; left: 0; right: 0; min-height: 80px; padding-bottom: 2rem; padding-top: 1.75rem; border-top: 1px ${theme['$borderColor'].val} solid; background-color: ${theme['$surface'].val} }
              .m-signature-pad--footer > .button { background-color: 'transparent'; font-size: 0.75rem; color: ${theme['$textPrimary'].val}; }
              .m-signature-pad--footer > .description { font-size: 0.75rem; color: ${theme['$textSecondary'].val}; }
              body,html { width: ${screenWidth}px; height: ${screenHeight}px; }`;

    const handleQrCodeScan = useCallback(
        async (data) => {
            setIsLoading(true);

            try {
                const proof = await order.captureQrCode(subject, { code: data.value, data, waypoint: waypoint?.id });
                setValue('proof', { proof, activity, order: order.id, waypoint: waypoint?.id, entity: entity?.id });
                navigation.goBack();
            } catch (err) {
                toast.error(err.message ?? 'Unable to validate captured QR Code.');
                console.warn('Error capturing QR code as proof:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [navigation]
    );

    const handleSignatureCompleted = useCallback(
        async (signature) => {
            setIsLoading(true);

            try {
                const proof = await order.captureSignature(subject, { signature });
                setValue('proof', { proof, activity, order: order.id, waypoint: waypoint?.id, entity: entity?.id });
                navigation.goBack();
            } catch (err) {
                toast.error(err.message ?? 'Something went wrong saving the signature.');
                console.warn('Error capturing signature as proof:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [navigation]
    );

    const handlePhotosCaptured = useCallback(
        async (photos = []) => {
            setIsLoading(true);

            // Resize all photos first in parallel
            const resizedPhotos = await Promise.all(
                photos.map(async (p) => {
                    const smallUri = await resizePhoto(p.uri);
                    // const smallBase64 = await RNFS.readFile(smallUri, 'base64');
                    // return { uri: smallUri, base64: smallBase64 };

                    return { uri: smallUri };
                })
            );

            const form = new FormData();
            resizedPhotos.forEach((p, i) => {
                form.append(`photos[${i}]`, {
                    uri: p.uri,
                    name: `photo-${i}.jpg`,
                    type: 'image/jpeg',
                });
            });

            try {
                const proof = await adapter.post(`orders/${order.id}/capture-photo`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
                setValue('proof', { proof, activity, order: order.id, waypoint: waypoint?.id, entity: entity?.id });
                navigation.goBack();
            } catch (err) {
                toast.error(err.message ?? 'Unable to upload captured photos.');
                console.warn('Error capturing photos as proof:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [adapter, navigation]
    );

    if (method === 'scan') {
        return (
            <YStack bg='transparent' flex={1}>
                <LoadingOverlay visible={isLoading} text={loadingOverlayMessage} textColor={isDarkMode ? '$textPrimary' : '$white'} />
                <CustomHeader headerTransparent={true} headerShadowVisible={false} headerLeft={<BackButton />} headerLeftStyle={{ paddingLeft: 10 }} />
                <QrCodeScanner onScan={handleQrCodeScan} />
            </YStack>
        );
    }

    if (method === 'photo') {
        return (
            <YStack bg='transparent' flex={1} position='relative'>
                <LoadingOverlay visible={isLoading} text={loadingOverlayMessage} textColor={isDarkMode ? '$textPrimary' : '$white'} />
                <CustomHeader
                    headerTransparent={true}
                    headerShadowVisible={false}
                    headerLeft={<BackButton />}
                    headerLeftStyle={{ paddingLeft: 10 }}
                    headerStyle={{ position: 'absolute', top: 0, left: 0, right: 0 }}
                />
                <CameraCapture onDone={handlePhotosCaptured} />
            </YStack>
        );
    }

    if (method === 'signature') {
        return (
            <YStack bg='$white' flex={1}>
                <LoadingOverlay visible={isLoading} text={loadingOverlayMessage} textColor={isDarkMode ? '$textPrimary' : '$white'} />
                <CustomHeader headerTransparent={true} headerShadowVisible={false} headerLeft={<BackButton />} headerLeftStyle={{ paddingLeft: 10 }} />
                <SignatureCanvas
                    ref={signatureScreenRef}
                    onOK={handleSignatureCompleted}
                    backgroundColor={'white'}
                    style={{ backgroundColor: 'white', flex: 1, width: '100%', height: '100%' }}
                    webStyle={signatureWebStyle}
                />
            </YStack>
        );
    }

    return <YStack flex={1}></YStack>;
};

export default ProofOfDeliveryScreen;
