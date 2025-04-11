import { Entity, Order, Place } from '@fleetbase/sdk';
import { faBarcode, faCamera, faSignature } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import OrderStatusBadge from 'components/OrderStatusBadge';
import { useFleetbase } from 'hooks';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Text, TouchableOpacity, View } from 'react-native';
import FastImage from 'react-native-fast-image';
import SignatureScreen from 'react-native-signature-canvas';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import tailwind from 'tailwind';
import { getColorCode, isEmpty, logError } from 'utils';

const { width, height } = Dimensions.get('window');

const ProofScreen = ({ navigation, route }) => {
    const { _order, _waypoint, _entity, activity } = route.params;

    const signatureScreenRef = useRef();
    const qrCodeScannerRef = useRef();
    const fleetbase = useFleetbase();

    const [order, setOrder] = useState(new Order(_order, fleetbase.getAdapter()));
    const [waypoint, setWaypoint] = useState(new Place(_waypoint, fleetbase.getAdapter()));
    const [entity, setEntity] = useState(new Entity(_entity, fleetbase.getAdapter()));
    const [isLoading, setIsLoading] = useState(false);
    const [isCapturingCode, setIsCapturingCode] = useState(false);

    const isMultiDropOrder = !isEmpty(order.getAttribute('payload.waypoints', []));
    const isScanningProof = activity?.pod_method === 'scan';
    const isSigningProof = activity?.pod_method === 'signature';
    const isPhotoProof = activity?.pod_method === 'photo';

    const isWaypoint = !isEmpty(_waypoint);
    const isEntity = !isEmpty(_entity);
    const isOrder = !isWaypoint && !isEntity;
    const cameraRef = useRef(Camera);
    const device = useCameraDevice('back');

    const cameraPermission = Camera.getCameraPermissionStatus();
    const newCameraPermission = Camera.requestCameraPermission();

    const catchError = (error, alertOptions = []) => {
        if (!error) {
            return;
        }

        logError(error);
        Alert.alert('Error', error?.message ?? 'An error occured', alertOptions);
    };

    const captureSignature = (signature) => {
        let subject = null;

        if (isEntity) {
            subject = entity;
        }

        if (isWaypoint && isMultiDropOrder) {
            subject = waypoint;
        }

        setIsLoading(true);

        return order
            .captureSignature(subject, {
                signature,
            })
            .then((proof) => {
                if (activity) {
                    return sendOrderActivityUpdate(proof);
                }

                navigation.goBack();
            })
            .catch(catchError)
            .finally(() => {
                setIsLoading(false);
            });
    };

    const codeScanner = useCodeScanner({
        codeTypes: ['qr', 'ean-13'],
        onCodeScanned: (event) => {
            if (isCapturingCode) {
                return;
            }
            console.log(`Scanned ${JSON.stringify(event)} codes!`);
            const [code] = event;

            captureScan(code);
        },
    });

    const capturePhoto = async () => {
        let subject = null;
        if (isEntity) {
            subject = entity;
        }

        if (isWaypoint && isMultiDropOrder) {
            subject = waypoint;
        }
        if (!cameraRef.current) return console.log('No camera');

        setIsLoading(true);

        try {
            const response = await cameraRef.current?.takePhoto();
            const photo = await fetchImage(response.path);
            const adapter = fleetbase.getAdapter();

            const proof = await adapter.post(`orders/${order.id}/capture-photo`, {
                photo,
            });

            if (activity) {
                await sendOrderActivityUpdate(proof);
            }

            navigation.goBack();
        } catch (error) {
            catchError(error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchImage = async (uri) => {
        const imageResponse = await fetch(uri);
        const imageBlob = await imageResponse.blob();
        const base64Data = await blobToBase64(imageBlob);
        return base64Data;
    };

    const blobToBase64 = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => {
                resolve(String(reader.result));
            };
            reader.readAsDataURL(blob);
        });
    };

    const captureScan = (data) => {
        let subject = null;

        if (isEntity) {
            subject = entity;
        }

        if (isWaypoint && isMultiDropOrder) {
            subject = waypoint;
        }

        setIsLoading(true);
        setIsCapturingCode(true);

        return order
            .captureQrCode(subject, {
                code: data.value,
                data,
            })
            .then((proof) => {
                if (activity) {
                    return sendOrderActivityUpdate(proof);
                }

                navigation.goBack();
            })
            .catch(catchError)
            .finally(() => {
                setIsLoading(false);
                setTimeout(() => {
                    qrCodeScannerRef.current?.reactivate();
                }, 600);
            });
    };

    const sendOrderActivityUpdate = (proof) => {
        setIsLoading(true);

        return order
            .updateActivity({ activity, proof: proof.id })
            .then(setOrder)
            .catch(catchError)
            .finally(() => {
                setIsLoading(false);
                navigation.goBack();
            });
    };

    return (
        <View style={[tailwind('bg-gray-800 h-full')]}>
            {isLoading && (
                <View style={tailwind('absolute w-full h-full bg-gray-900 opacity-50 flex items-center justify-center z-50')}>
                    <ActivityIndicator color={getColorCode('text-green-500')} size={'large'} style={tailwind('mt-10')} />
                </View>
            )}
            <View style={[tailwind('z-50 bg-gray-800 border-b border-gray-900 shadow-lg pt-2')]}>
                <View style={tailwind('flex flex-row items-start justify-between px-4 py-2 overflow-hidden')}>
                    {!isPhotoProof && (
                        <View style={tailwind('flex-1 flex items-start')}>
                            <View style={tailwind('flex flex-row items-center')}>
                                <FontAwesomeIcon icon={isScanningProof ? faBarcode : faSignature} style={tailwind('text-blue-100 mr-2')} size={30} />
                                <Text style={tailwind('text-xl font-semibold text-blue-100')}>{isScanningProof ? 'Scan QR Code' : 'Please Sign'}</Text>
                            </View>
                        </View>
                    )}
                    {isPhotoProof && (
                        <View style={tailwind('flex-1 flex items-start')}>
                            <View style={tailwind('flex flex-row items-center')}>
                                <FontAwesomeIcon icon={faCamera} style={tailwind('text-blue-100 mr-2')} size={20} />
                                <Text style={tailwind('text-xl font-semibold text-blue-100')}>{'Take a Photo'}</Text>
                            </View>
                        </View>
                    )}
                </View>
            </View>
            <View>
                {isSigningProof && (
                    <View style={tailwind('bg-white h-full w-full')}>
                        <SignatureScreen style={tailwind('bg-white h-full w-full')} ref={signatureScreenRef} onOK={captureSignature} backgroundColor={'white'} />
                        <View style={tailwind('absolute bottom-0 w-full')}>
                            <View style={tailwind('px-4')}>
                                <View style={tailwind('border border-gray-900 bg-gray-800 rounded-md shadow-lg px-3 py-2 mb-32')}>
                                    <View style={tailwind('flex flex-row items-center')}>
                                        <View style={tailwind('flex-1')}>
                                            <TouchableOpacity
                                                style={tailwind('pr-1')}
                                                onPress={() => {
                                                    signatureScreenRef.current?.undo();
                                                }}
                                            >
                                                <View style={tailwind('btn bg-gray-800 border border-gray-700 bg-opacity-75')}>
                                                    <Text style={tailwind('font-semibold text-gray-50 text-base')}>Reset</Text>
                                                </View>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={tailwind('flex-1')}>
                                            <TouchableOpacity
                                                style={tailwind('pl-1')}
                                                onPress={() => {
                                                    signatureScreenRef.current.readSignature(captureSignature);
                                                }}
                                            >
                                                <View style={tailwind('btn bg-green-900 border border-green-700')}>
                                                    {isLoading && <ActivityIndicator color={getColorCode('text-green-50')} style={tailwind('mr-2')} />}
                                                    <Text style={tailwind('font-semibold text-green-50 text-base')}>Capture</Text>
                                                </View>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>
                )}
                {isScanningProof && (
                    <View style={tailwind('relative h-full')}>
                        <Camera showref={cameraRef} style={[{ height: height - 180 }]} device={device} isActive={true} codeScanner={codeScanner} />

                        <View style={tailwind('absolute bottom-0 z-20 w-full')}>
                            <View style={tailwind('px-4')}>
                                <View style={tailwind('border bg-blue-900 border border-blue-700 rounded-md shadow-lg mb-32')}>
                                    <View style={tailwind('px-3 py-2 border-b border-blue-700')}>
                                        <Text style={tailwind('font-semibold text-base text-blue-50')}>Focus target at QR Code to Scan</Text>
                                    </View>
                                    <View style={tailwind('px-3 py-2')}>
                                        {isWaypoint && waypoint && (
                                            <View>
                                                <Text style={tailwind('font-bold text-white mb-1')}>Current Destination</Text>
                                                <Text style={tailwind('text-blue-50')}>{waypoint.getAttribute('address')}</Text>
                                                {waypoint.getAttribute('tracking_number.status_code') && (
                                                    <View style={tailwind('my-2 flex flex-row')}>
                                                        <OrderStatusBadge status={waypoint.getAttribute('tracking_number.status_code')} wrapperStyle={tailwind('flex-grow-0')} />
                                                    </View>
                                                )}
                                            </View>
                                        )}
                                        {isOrder && (
                                            <View>
                                                <Text style={tailwind('font-bold text-white mb-1')}>Current Destination</Text>
                                                <Text style={tailwind('text-blue-50')}>{order.getAttribute('payload.pickup.address')}</Text>
                                                {order.getAttribute('tracking_number.status_code') && (
                                                    <View style={tailwind('my-2 flex flex-row')}>
                                                        <OrderStatusBadge status={order.getAttribute('tracking_number.status_code')} wrapperStyle={tailwind('flex-grow-0')} />
                                                    </View>
                                                )}
                                            </View>
                                        )}
                                        {isEntity && (
                                            <View style={tailwind('flex flex-row py-2 px-3')}>
                                                <View style={tailwind('mr-4')}>
                                                    <FastImage source={{ uri: entity.getAttribute('photo_url') }} style={tailwind('w-12 h-12 rounded-md')} />
                                                </View>
                                                <View>
                                                    <Text style={tailwind('font-bold text-blue-50 mb-1')} numberOfLines={1}>
                                                        {entity.getAttribute('name')}
                                                    </Text>
                                                    <Text style={tailwind('text-blue-50')} numberOfLines={1}>
                                                        Tracking: {entity.getAttribute('tracking_number.tracking_number')}
                                                    </Text>
                                                    {entity.isAttributeFilled('tracking_number.internal_id') && (
                                                        <Text style={tailwind('text-blue-50')} numberOfLines={1}>
                                                            Internal ID: {entity.getAttribute('tracking_number.internal_id')}
                                                        </Text>
                                                    )}
                                                    {entity.isAttributeFilled('tracking_number.sku') && (
                                                        <Text style={tailwind('text-blue-50')} numberOfLines={1}>
                                                            SKU: {entity.getAttribute('tracking_number.sku')}
                                                        </Text>
                                                    )}
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>
                )}
                {isPhotoProof && (
                    <View style={tailwind('relative h-full')}>
                        <Camera cameraConfig={{ type: 'back' }} ref={cameraRef} style={[{ height: height - 180 }]} device={device} isActive={true} photo={true}>
                            <View style={tailwind('flex-1 justify-end items-center')}>
                                <TouchableOpacity onPress={capturePhoto} style={tailwind('mb-6')}>
                                    <View style={tailwind('w-20 h-20 bg-white rounded-full justify-center items-center')}></View>
                                </TouchableOpacity>
                            </View>
                        </Camera>
                    </View>
                )}
            </View>
        </View>
    );
};
export default ProofScreen;
