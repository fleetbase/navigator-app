import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Alert, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faTimes, faBarcode, faSignature } from '@fortawesome/free-solid-svg-icons';
import { Order, Place, Entity } from '@fleetbase/sdk';
import { useFleetbase, useMountedState, useLocale } from 'hooks';
import { isEmpty, getColorCode, logError } from 'utils';
import { RNCamera } from 'react-native-camera';
import FastImage from 'react-native-fast-image';
import QRCodeScanner from 'react-native-qrcode-scanner';
import SignatureCapture from 'react-native-signature-capture';
import OrderStatusBadge from 'components/OrderStatusBadge';
import tailwind from 'tailwind';

const { width, height } = Dimensions.get('window');

const ProofScreen = ({ navigation, route }) => {
    const { _order, _waypoint, _entity, activity } = route.params;

    const signatureScreenRef = useRef();
    const qrCodeScannerRef = useRef();
    const insets = useSafeAreaInsets();
    const isMounted = useMountedState();
    const fleetbase = useFleetbase();
    const [locale] = useLocale();

    const [order, setOrder] = useState(new Order(_order, fleetbase.getAdapter()));
    const [waypoint, setWaypoint] = useState(new Place(_waypoint, fleetbase.getAdapter()));
    const [entity, setEntity] = useState(new Entity(_entity, fleetbase.getAdapter()));
    const [isLoading, setIsLoading] = useState(false);

    const isMultiDropOrder = !isEmpty(order.getAttribute('payload.waypoints', []));
    const isScanningProof = activity?.pod_method === 'scan';
    const isSigningProof = activity?.pod_method === 'signature';
    const isWaypoint = !isEmpty(_waypoint);
    const isEntity = !isEmpty(_entity);
    const isOrder = !isWaypoint && !isEntity;

    const catchError = (error, alertOptions = []) => {
        if (!error) {
            return;
        }

        logError(error);
        Alert.alert('Error', error?.message ?? 'An error occured', alertOptions);
    };

    const captureSignature = (event) => {
        const { encoded } = event;

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
                signature: encoded,
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

    const captureScan = (event) => {
        let subject = null;

        if (isEntity) {
            subject = entity;
        }

        if (isWaypoint && isMultiDropOrder) {
            subject = waypoint;
        }

        setIsLoading(true);

        return order
            .captureQrCode(subject, {
                code: event.data,
                data: event,
                raw_data: event.rawData,
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
                    <View style={tailwind('flex-1 flex items-start')}>
                        <View style={tailwind('flex flex-row items-center')}>
                            <FontAwesomeIcon icon={isScanningProof ? faBarcode : faSignature} style={tailwind('text-blue-100 mr-2')} size={30} />
                            <Text style={tailwind('text-xl font-semibold text-blue-100')}>{isScanningProof ? 'Scan QR Code' : 'Please Sign'}</Text>
                        </View>
                    </View>
                    <View>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('')}>
                            <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                                <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
            <View>
                {isSigningProof && (
                    <View style={tailwind('bg-white h-full w-full')}>
                        <SignatureCapture
                            style={tailwind('bg-white h-full w-full')}
                            ref={signatureScreenRef}
                            onSaveEvent={captureSignature}
                            saveImageFileInExtStorage={false}
                            showNativeButtons={false}
                            showTitleLabel={false}
                            backgroundColor={'white'}
                            strokeColor={'black'}
                            minStrokeWidth={4}
                            maxStrokeWidth={4}
                            viewMode={'portrait'}
                        />
                        <View style={tailwind('absolute bottom-0 w-full')}>
                            <View style={tailwind('px-4')}>
                                <View style={tailwind('border border-gray-900 bg-gray-800 rounded-md shadow-lg px-3 py-2 mb-32')}>
                                    <View style={tailwind('flex flex-row items-center')}>
                                        <View style={tailwind('flex-1')}>
                                            <TouchableOpacity
                                                style={tailwind('pr-1')}
                                                onPress={() => {
                                                    signatureScreenRef.current?.resetImage();
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
                                                    signatureScreenRef.current?.saveImage();
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
                        <QRCodeScanner
                            ref={qrCodeScannerRef}
                            onRead={captureScan}
                            flashMode={RNCamera.Constants.FlashMode.auto}
                            topViewStyle={tailwind('flex-none')}
                            markerStyle={tailwind('-mt-10')}
                            showMarker={true}
                            cameraStyle={[{ height: height - 180 }, tailwind('z-10')]}
                        />
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
            </View>
        </View>
    );
};

export default ProofScreen;
