import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Animated, SafeAreaView, Pressable, FlatList, LayoutAnimation, UIManager, Platform } from 'react-native';
import { Spinner, Button, Text, YStack, XStack, Separator, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faChevronRight, faCheck, faLocationDot } from '@fortawesome/free-solid-svg-icons';
import { toast, ToastPosition } from '@backpackapp-io/react-native-toast';
import { useNavigation } from '@react-navigation/native';
import BottomSheet, { BottomSheetView, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Portal } from '@gorhom/portal';
import { formattedAddressFromPlace, formatAddressSecondaryIdentifier } from '../utils/location';
import PlaceMapView from './PlaceMapView';
import Badge from './Badge';
import Spacer from './Spacer';
import useAppTheme from '../hooks/use-app-theme';

const CurrentDestinationSelect = ({ onChange, destination, waypoints = [], snapTo = '100%', isLoading = false, ...props }) => {
    const { isDarkMode } = useAppTheme();
    const theme = useTheme();
    const navigation = useNavigation();
    const bottomSheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => [snapTo], [snapTo]);
    const desinationStatus = destination.getAttribute('status');

    const openBottomSheet = () => {
        bottomSheetRef.current?.snapToPosition(snapTo);
    };

    const closeBottomSheet = () => {
        bottomSheetRef.current?.close();
    };

    const handleDestinationSelect = async (place) => {
        closeBottomSheet();

        if (typeof onChange === 'function') {
            onChange(place);
        }
    };

    return (
        <YStack>
            <Pressable onPress={openBottomSheet}>
                <YStack bg={isDarkMode ? '$default' : '$gray-200'} borderWidth={1} borderColor={isDarkMode ? '$defaultBorder' : '$gray-300'} borderRadius='$4' px='$3' py='$3' {...props}>
                    <XStack>
                        <YStack width={100} height={90}>
                            <PlaceMapView place={destination} zoom={2} markerSize='xs' width={100} height={90} borderWidth={1} borderColor='$borderColor' />
                        </YStack>
                        <YStack flex={1} px='$3'>
                            {isLoading ? (
                                <YStack flex={1} justifyContent='center'>
                                    <Spinner size='lg' color='$blue-100' />
                                </YStack>
                            ) : (
                                <YStack>
                                    <Text size={15} color={isDarkMode ? '$infoText' : '$gray-700'} fontWeight='bold' textTransform='uppercase' mb={2}>
                                        {destination.getAttribute('name') ?? 'Current Destination'}
                                    </Text>
                                    <Text color={isDarkMode ? '$textSecondary' : '$gray-500'} textTransform='uppercase' mb='$1'>
                                        {formattedAddressFromPlace(destination)}
                                    </Text>
                                    <YStack alignSelf='flex-start'>
                                        {desinationStatus ? (
                                            <YStack pt='$1'>
                                                <Badge status={desinationStatus} />
                                            </YStack>
                                        ) : (
                                            <Text color='$textSecondary' numberOfLines={1}>
                                                ID: {destination.id}
                                            </Text>
                                        )}
                                    </YStack>
                                </YStack>
                            )}
                        </YStack>
                        <YStack justifyContent='center'>
                            <FontAwesomeIcon icon={faChevronRight} color={isDarkMode ? theme.infoText.val : theme['gray-500'].val} />
                        </YStack>
                    </XStack>
                </YStack>
            </Pressable>
            <Portal hostName='MainPortal'>
                <BottomSheet
                    ref={bottomSheetRef}
                    index={-1}
                    snapPoints={snapPoints}
                    keyboardBehavior='extend'
                    keyboardBlurBehavior='none'
                    enableDynamicSizing={false}
                    enablePanDownToClose={true}
                    enableOverDrag={false}
                    style={{ flex: 1, width: '100%' }}
                    backgroundStyle={{ backgroundColor: theme.surface.val, borderWidth: 1, borderColor: theme.borderColorWithShadow.val }}
                    handleIndicatorStyle={{ backgroundColor: theme.secondary.val }}
                >
                    <BottomSheetView style={{ flex: 1, backgroundColor: theme.surface.val }}>
                        <YStack>
                            <XStack alignItems='center' justifyContent='space-between' px='$5' mb='$4'>
                                <Text fontSize='$6' color='$textPrimary' fontWeight='bold'>
                                    Select destination
                                </Text>
                            </XStack>
                            <BottomSheetFlatList
                                data={waypoints}
                                keyExtractor={(item, index) => index}
                                showsVerticalScrollIndicator={false}
                                showsHorizontalScrollIndicator={false}
                                renderItem={({ item: waypoint }) => {
                                    const isCompleted = waypoint.getAttribute('complete');
                                    const isDestination = destination && destination.id === waypoint.id;
                                    return (
                                        <YStack px='$4'>
                                            <Button
                                                onPress={() => handleDestinationSelect(waypoint)}
                                                minHeight='auto'
                                                height='auto'
                                                bg={isCompleted ? '$success' : isDestination ? '$info' : '$secondary'}
                                                borderWidth={1}
                                                borderColor={isCompleted ? '$successBorder' : isDestination ? '$infoBorder' : '$borderColorWithShadow'}
                                                justifyContent='space-between'
                                                space='$1'
                                                mb='$3'
                                                px='$2'
                                                py='$3'
                                                borderRadius='$4'
                                                hoverStyle={{
                                                    scale: 0.9,
                                                    opacity: 0.5,
                                                }}
                                                pressStyle={{
                                                    scale: 0.9,
                                                    opacity: 0.5,
                                                }}
                                            >
                                                <XStack>
                                                    {isCompleted && (
                                                        <YStack mr='$2'>
                                                            <YStack
                                                                mt='$1'
                                                                borderRadius={Platform.OS === 'android' ? 24 : '100%'}
                                                                width={24}
                                                                height={24}
                                                                bg='$successBorder'
                                                                alignItems='center'
                                                                justifyContent='center'
                                                            >
                                                                <FontAwesomeIcon icon={faCheck} color={theme['$success'].val} />
                                                            </YStack>
                                                        </YStack>
                                                    )}
                                                    {isDestination && (
                                                        <YStack mr='$2'>
                                                            <YStack
                                                                mt='$1'
                                                                borderRadius={Platform.OS === 'android' ? 24 : '100%'}
                                                                width={24}
                                                                height={24}
                                                                bg='$infoBorder'
                                                                alignItems='center'
                                                                justifyContent='center'
                                                            >
                                                                <FontAwesomeIcon icon={faLocationDot} color={isDestination ? theme['white'].val : theme['$info'].val} />
                                                            </YStack>
                                                        </YStack>
                                                    )}
                                                    <XStack flex={1} alignItems='flex-start'>
                                                        <YStack flex={1}>
                                                            <XStack alignItems='flex-start' justifyContent='space-between' mb='$2'>
                                                                <YStack flex={1} space='$1'>
                                                                    <Text color={isDestination ? '$white' : '$textPrimary'} fontWeight='bold' numberOfLines={1}>
                                                                        {waypoint.getAttribute('name') ?? waypoint.getAttribute('street1')}
                                                                    </Text>
                                                                    {isDestination && <Text color='$infoText'>(Destination)</Text>}
                                                                </YStack>
                                                                {typeof waypoint.getAttribute('status') === 'string' && (
                                                                    <Badge status={waypoint.getAttribute('status')} fontSize='$1' px='$2' py='$1' />
                                                                )}
                                                            </XStack>
                                                            <YStack flexWrap='wrap'>
                                                                <Text color={isDestination ? '$gray-200' : '$textSecondary'} flexShrink={1} maxWidth='100%'>
                                                                    {formattedAddressFromPlace(waypoint)}
                                                                </Text>
                                                                <Text color={isDestination ? '$gray-200' : '$textSecondary'} flexShrink={1} maxWidth='100%'>
                                                                    {formatAddressSecondaryIdentifier(waypoint)}
                                                                </Text>
                                                            </YStack>
                                                        </YStack>
                                                    </XStack>
                                                </XStack>
                                            </Button>
                                        </YStack>
                                    );
                                }}
                            />
                            <Spacer height={200} />
                        </YStack>
                    </BottomSheetView>
                </BottomSheet>
            </Portal>
        </YStack>
    );
};

export default CurrentDestinationSelect;
