import React, { useEffect, useState, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Animated, SafeAreaView, Pressable, FlatList, LayoutAnimation, UIManager, Platform } from 'react-native';
import { Spinner, Button, Text, YStack, XStack, Separator, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faLightbulb, faLocationDot } from '@fortawesome/free-solid-svg-icons';
import { toast, ToastPosition } from '@backpackapp-io/react-native-toast';
import { useNavigation } from '@react-navigation/native';
import { WaypointItem } from './OrderWaypointList';
import BottomSheet, { BottomSheetView, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Portal } from '@gorhom/portal';
import { formattedAddressFromPlace, formatAddressSecondaryIdentifier } from '../utils/location';
import { getColorFromStatus } from '../utils/format';
import useAppTheme from '../hooks/use-app-theme';
import PlaceMapView from './PlaceMapView';
import Spacer from './Spacer';
import Badge from './Badge';

const OrderActivitySelect = forwardRef(({ onChange, waypoint, activities = [], snapTo = '100%', isLoading = false, activityLoading, portalHost = 'MainPortal', ...props }, ref) => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { isDarkMode } = useAppTheme();
    const bottomSheetRef = useRef(null);
    const snapPoints = useMemo(() => [snapTo], [snapTo]);

    // Expose methods to the parent via ref.
    useImperativeHandle(
        ref,
        () => ({
            openBottomSheet: () => bottomSheetRef.current?.snapToPosition(snapTo),
            closeBottomSheet: () => bottomSheetRef.current?.close(),
            getBottomSheetRef: () => bottomSheetRef.current,
        }),
        [snapTo]
    );

    const openBottomSheet = () => {
        bottomSheetRef.current?.snapToPosition(snapTo);
    };

    const closeBottomSheet = () => {
        bottomSheetRef.current?.close();
    };

    const handleActivitySelect = async (activity) => {
        closeBottomSheet();
        if (typeof onChange === 'function') {
            onChange(activity);
        }
    };

    const renderActivity = ({ item: activity }) => {
        const statusColor = getColorFromStatus(activity.code);
        const backgroundColor = `$${statusColor}-${isDarkMode ? '900' : '600'}`;
        const borderColor = `$${statusColor}-${isDarkMode ? '600' : '700'}`;
        const fontColor = `$${statusColor}-100`;

        return (
            <Pressable onPress={() => handleActivitySelect(activity)} style={{ marginBottom: 14 }}>
                <YStack bg={backgroundColor} borderWidth={1} borderColor={borderColor} px='$3' py='$3' alignItems='center' justifyContent='flex-start' borderRadius='$4'>
                    <XStack alignItems='flex-start'>
                        {activityLoading === activity.code && (
                            <YStack mt='$1' mr='$2'>
                                <Spinner color={fontColor} />
                            </YStack>
                        )}
                        <YStack flex={1} space='$1'>
                            <YStack space='$1'>
                                <Text fontSize={16} color={fontColor} fontWeight='bold' numberOfLines={1}>
                                    {activity._resolved_status ?? activity.status}
                                </Text>
                                <Text color={fontColor}>{activity._resolved_details ?? activity.details}</Text>
                            </YStack>

                            {activity.require_pod && (
                                <XStack
                                    alignSelf='flex-start'
                                    bg='$warning'
                                    borderWidth={1}
                                    borderColor='$warningBorder'
                                    borderRadius='$4'
                                    px='$3'
                                    py='$2'
                                    mt='$2'
                                    alignItems='center'
                                    space='$2'
                                >
                                    <FontAwesomeIcon icon={faLightbulb} color={theme['$warningText'].val} />
                                    <Text color='$warningText'>Requires proof of delivery</Text>
                                </XStack>
                            )}
                        </YStack>
                    </XStack>
                </YStack>
            </Pressable>
        );
    };

    return (
        <YStack>
            <Portal hostName={portalHost}>
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
                    backgroundStyle={{ backgroundColor: isDarkMode ? theme.surface.val : theme.background.val, borderWidth: 1, borderColor: theme.borderColorWithShadow.val }}
                    handleIndicatorStyle={{ backgroundColor: theme.secondary.val }}
                >
                    <BottomSheetView style={{ flex: 1, backgroundColor: isDarkMode ? theme.surface.val : theme.background.val }}>
                        <YStack>
                            <XStack alignItems='center' justifyContent='space-between' px='$5' mb='$4'>
                                <Text fontSize='$6' color='$textPrimary' fontWeight='bold'>
                                    Select activity
                                </Text>
                            </XStack>
                            {waypoint && (
                                <YStack px='$3' pt='$4' mb='$4' borderTopWidth={1} borderBottomWidth={1} borderColor='$infoBorder' bg='$info'>
                                    <Text color='$infoText' fontWeight={17} fontWeight='bold' mb='$2' textTransform='uppercase'>
                                        Updating activity for:
                                    </Text>
                                    <WaypointItem
                                        waypoint={waypoint.serialize()}
                                        icon={faLocationDot}
                                        iconColor={theme['$infoText'].val}
                                        textStyle={{ fontSize: 14, fontWeight: 'bold', color: theme['$infoText'].val }}
                                    />
                                </YStack>
                            )}
                            {isLoading ? (
                                <YStack alignItems='center' justifyContent='center' height={200} width='100%'>
                                    <Spinner color='$textPrimary' size='$6' />
                                </YStack>
                            ) : (
                                <BottomSheetFlatList
                                    data={activities}
                                    keyExtractor={(item, index) => index.toString()}
                                    showsVerticalScrollIndicator={false}
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={{ paddingLeft: 18, paddingRight: 18 }}
                                    renderItem={renderActivity}
                                    ListFooterComponent={<Spacer height={200} />}
                                />
                            )}
                            <Spacer height={200} />
                        </YStack>
                    </BottomSheetView>
                </BottomSheet>
            </Portal>
        </YStack>
    );
});

export default OrderActivitySelect;
