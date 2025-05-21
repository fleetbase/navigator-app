import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlatList, Pressable, Modal } from 'react-native';
import { SimpleGrid } from 'react-native-super-grid';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faTimes, faQrcode } from '@fortawesome/free-solid-svg-icons';
import { Text, YStack, XStack, useTheme, Button } from 'tamagui';
import { format } from 'date-fns';
import FastImage from 'react-native-fast-image';
import useStorage from '../hooks/use-storage';
import useFleetbase from '../hooks/use-fleetbase';

const PROOF_COLUMN_WIDTH = 160;

const OrderProofOfDelivery = ({ order, subject }) => {
    const { adapter } = useFleetbase();
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const id = order.id ?? null;
    const [proofs, setProofs] = useStorage(`${id}_proofs`, []);
    const [isLoading, setIsLoading] = useState(false);
    const [fullscreenImage, setFullscreenImage] = useState(null);

    const loadOrderProof = useCallback(async () => {
        if (!adapter) return;
        setIsLoading(true);

        const subjectSuffix = subject ? `/${subject.id}` : '';

        try {
            const proofs = await adapter.get(`orders/${order.id}/proofs${subjectSuffix}`);
            setProofs(proofs);
            return proofs;
        } catch (err) {
            console.warn('Error loading order proofs:', err);
        } finally {
            setIsLoading(false);
        }
    }, [adapter]);

    const openImage = (proof) => {
        let url = proof.url;
        if (proof.remarks.endsWith('Signature')) {
            url = proof.raw;
        }
        setFullscreenImage(url);
    };

    const closeImage = () => {
        setFullscreenImage(null);
    };

    const renderProof = ({ item: proof }) => {
        return (
            <YStack px='$3' py='$2' width={PROOF_COLUMN_WIDTH}>
                <YStack mb='$2'>
                    <Pressable onPress={() => openImage(proof)}>
                        {proof.remarks.endsWith('Photo') && (
                            <FastImage
                                source={{ uri: proof.url }}
                                style={{
                                    width: PROOF_COLUMN_WIDTH - 25,
                                    height: PROOF_COLUMN_WIDTH - 25,
                                    borderRadius: 8,
                                }}
                            />
                        )}
                        {proof.remarks.endsWith('Signature') && (
                            <FastImage
                                source={{ uri: proof.raw }}
                                style={{
                                    width: PROOF_COLUMN_WIDTH - 25,
                                    height: PROOF_COLUMN_WIDTH - 25,
                                    borderRadius: 8,
                                }}
                            />
                        )}
                        {proof.remarks.endsWith('Scan') && (
                            <YStack alignItems='center' justifyContent='center'>
                                <FontAwesomeIcon icon={faQrcode} color={theme['$blue-400'].val} size={40} />
                            </YStack>
                        )}
                    </Pressable>
                </YStack>
                <YStack textAlign='center' alignItems='center' justifyContent='center' width='100%' flex={1}>
                    <Text color='$textPrimary' fontSize='$2' textAlign='center' fontWeight='bold' mb='$1'>
                        {proof.remarks}
                    </Text>
                    <Text color='$textSecondary' fontSize='$2' textAlign='center'>
                        {proof.id}
                    </Text>
                    <Text color='$textSecondary' fontSize='$2' textAlign='center'>
                        {format(proof.created_at, 'MMM d, y HH:mm')}
                    </Text>
                </YStack>
            </YStack>
        );
    };

    useFocusEffect(
        useCallback(() => {
            loadOrderProof();
        }, [id])
    );

    if (proofs.length === 0) {
        return (
            <YStack py='$5' alignItems='center' justifyContent='center'>
                <Text color='$textSecondary'>No Proof of Delivery Captured.</Text>
            </YStack>
        );
    }

    return (
        <YStack>
            <SimpleGrid
                data={proofs}
                maxItemsPerRow={2}
                itemDimension={PROOF_COLUMN_WIDTH}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item, index) => item.id || index}
                renderItem={renderProof}
            />

            {fullscreenImage && (
                <Modal visible={true} animationType='fade' transparent={true}>
                    <YStack position='absolute' fullscreen bg='rgba(0,0,0,0.9)' justifyContent='center' alignItems='center' zIndex={9999}>
                        <Button position='absolute' top={20} right={20} size='$3' circular bg='$colorTransparent' onPress={closeImage} zIndex={10000} mt={insets.top}>
                            <FontAwesomeIcon icon={faTimes} color={theme['$textPrimary'].val} />
                        </Button>

                        <FastImage
                            source={{ uri: fullscreenImage }}
                            style={{
                                width: '100%',
                                height: '100%',
                                resizeMode: 'contain',
                            }}
                        />
                    </YStack>
                </Modal>
            )}
        </YStack>
    );
};

export default OrderProofOfDelivery;
