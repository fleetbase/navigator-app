import React, { useState, useEffect, useMemo, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { FlatList, TextInput, Keyboard } from 'react-native';
import BottomSheet, { BottomSheetView, BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useTheme, View, Text, Button, XStack, YStack, Input } from 'tamagui';
import { Portal } from '@gorhom/portal';
import { titleize as titleizeString } from 'inflected';
import useAppTheme from '../hooks/use-app-theme';

const BottomSheetSelect = forwardRef(
    (
        {
            value,
            onChange,
            onSelect,
            options = [],
            optionValue,
            optionLabel,
            renderOption,
            placeholder = 'Select an option',
            searchPlaceholder = 'Search options',
            title,
            portalHost = 'MainPortal',
            snapTo = '90%',
            humanize = false,
            onBottomSheetPositionChanged,
            onBottomSheetOpened,
            onBottomSheetClosed,
            virtual = false,
            renderInPlace = false,
        },
        ref
    ) => {
        const theme = useTheme();
        const { isDarkMode } = useAppTheme();
        const [selected, setSelected] = useState(value);
        const [searchTerm, setSearchTerm] = useState('');
        const bottomSheetRef = useRef(null);
        const searchInputRef = useRef(null);
        const snapPoints = useMemo(() => [snapTo], [snapTo]);

        // Expose bottomSheetRef to parent components
        useImperativeHandle(
            ref,
            () => ({
                openBottomSheet,
                closeBottomSheet,
                getRef: () => bottomSheetRef.current,
            }),
            [openBottomSheet, closeBottomSheet]
        );

        const filteredOptions = useMemo(() => {
            return options.filter((option) => {
                const lowerSearch = searchTerm.toLowerCase();
                if (lowerSearch) {
                    if (typeof option === 'string') {
                        return option.toLowerCase().includes(lowerSearch);
                    }

                    const optionLabel = typeof optionLabel === 'string' ? option[optionLabel] : '';
                    const optionValue = typeof optionValue === 'string' ? option[optionValue] : '';
                    return optionValue.toLowerCase().includes(lowerSearch) || optionLabel.toLowerCase().includes(lowerSearch);
                }

                return true;
            });
        }, [searchTerm, options, optionLabel, optionValue]);

        const openBottomSheet = () => {
            Keyboard.dismiss();
            bottomSheetRef.current?.snapToPosition(snapTo);
        };

        const closeBottomSheet = () => {
            Keyboard.dismiss();
            bottomSheetRef.current?.close();
        };

        const handleSelect = useCallback(
            (option) => {
                setSelected(option);
                closeBottomSheet();

                if (typeof onChange === 'function') {
                    onChange(option);
                }

                if (typeof onSelect === 'function') {
                    onSelect(option);
                }
            },
            [setSelected]
        );

        const renderSelected = useCallback(() => {
            if (typeof selected === 'string') {
                if (humanize === true) {
                    return titleizeString(selected);
                }
                return selected;
            }

            if (typeof optionLabel === 'string' && isObject(selected)) {
                return selected[optionLabel];
            }
        }, [selected]);

        const handleBottomSheetPositionChange = useCallback(
            (fromIndex, toIndex) => {
                const isOpen = toIndex >= 0;

                if (typeof onBottomSheetPositionChanged === 'function') {
                    onBottomSheetPositionChanged(isOpen, fromIndex, toIndex);
                }

                if (isOpen === true && typeof onBottomSheetOpened === 'function') {
                    onBottomSheetOpened(isOpen, fromIndex, toIndex);
                }

                if (isOpen === false && typeof onBottomSheetClosed === 'function') {
                    onBottomSheetClosed(isOpen, fromIndex, toIndex);
                }
            },
            [onBottomSheetPositionChanged, onBottomSheetOpened, onBottomSheetClosed]
        );

        const RenderBottomSheet = () => {
            return (
                <BottomSheet
                    ref={bottomSheetRef}
                    index={-1}
                    snapPoints={snapPoints}
                    onAnimate={handleBottomSheetPositionChange}
                    keyboardBehavior='extend'
                    keyboardBlurBehavior='none'
                    enableDynamicSizing={false}
                    enablePanDownToClose={true}
                    enableOverDrag={false}
                    style={{ flex: 1, width: '100%' }}
                    backgroundStyle={{ backgroundColor: theme.background.val, borderWidth: 1, borderColor: theme.borderColorWithShadow.val }}
                    handleIndicatorStyle={{ backgroundColor: theme.secondary.val }}
                >
                    {title && (
                        <YStack px='$3' pb='$3'>
                            <Text color='$textPrimary' fontSize={18}>
                                {title}
                            </Text>
                        </YStack>
                    )}
                    <YStack px='$2'>
                        <BottomSheetTextInput
                            ref={searchInputRef}
                            placeholder={searchPlaceholder}
                            onChangeText={setSearchTerm}
                            autoCapitalize={false}
                            autoComplete='off'
                            autoCorrect={false}
                            style={{
                                color: theme.textPrimary.val,
                                backgroundColor: theme.surface.val,
                                borderWidth: 1,
                                borderColor: theme.borderColor.val,
                                padding: 14,
                                borderRadius: 13,
                                fontSize: 13,
                                marginBottom: 10,
                            }}
                        />
                    </YStack>
                    <BottomSheetView
                        style={{ flex: 1, backgroundColor: theme.background.val, paddingHorizontal: 8, borderColor: theme.borderColorWithShadow.val, borderWidth: 1, borderTopWidth: 0 }}
                    >
                        <BottomSheetFlatList
                            data={filteredOptions}
                            keyExtractor={(item, index) => index}
                            renderItem={({ item, index }) => {
                                if (typeof renderOption === 'function') {
                                    return renderOption({ item, index, handleSelect });
                                }

                                return (
                                    <Button
                                        size='$4'
                                        onPress={() => handleSelect(typeof optionValue === 'string' ? item[optionValue] : item)}
                                        bg='$surface'
                                        justifyContent='space-between'
                                        space='$2'
                                        mb='$2'
                                        px='$3'
                                        hoverStyle={{
                                            scale: 0.9,
                                            opacity: 0.5,
                                        }}
                                        pressStyle={{
                                            scale: 0.9,
                                            opacity: 0.5,
                                        }}
                                    >
                                        <Text>{typeof optionLabel === 'string' ? item[optionLabel] : item}</Text>
                                    </Button>
                                );
                            }}
                        />
                    </BottomSheetView>
                </BottomSheet>
            );
        };

        console.log('[BottomSheetSelect Rendered!]');

        return (
            <YStack>
                {virtual === false && (
                    <Button justifyContent='flex-start' textAlign='left' onPress={openBottomSheet} bg='$surface' borderWidth={1} borderColor='$borderColor' borderRadius='$5'>
                        {selected ? (
                            <Button.Text color='$textPrimary' fontSize={15}>
                                {renderSelected()}
                            </Button.Text>
                        ) : (
                            <Button.Text color='$textSecondary' fontSize={15}>
                                {placeholder}
                            </Button.Text>
                        )}
                    </Button>
                )}

                {renderInPlace === true ? (
                    <RenderBottomSheet />
                ) : (
                    <Portal hostName={portalHost}>
                        <RenderBottomSheet />
                    </Portal>
                )}
            </YStack>
        );
    }
);

export default BottomSheetSelect;
