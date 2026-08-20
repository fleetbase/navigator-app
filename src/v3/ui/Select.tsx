/**
 * Bottom-sheet select — ported from src/components/BottomSheetSelect.tsx, the
 * most reusable component in the v2 tree.
 *
 * Two defects fixed on the way across: a TDZ ReferenceError that broke search
 * over object options, and a keyExtractor returning a number instead of a string.
 */
import React, { useState, useMemo, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Keyboard } from 'react-native';
import BottomSheet, { BottomSheetView, BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useTheme, Text, Button, YStack } from 'tamagui';
import { Portal } from '@gorhom/portal';
import { radius } from '../theme/tokens';

/**
 * v2 called `isObject(selected)` in renderSelected() without importing it —
 * a ReferenceError every time a select with object options had a value.
 * Declared locally so this component carries no v2 dependency.
 */
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
import { titleize as titleizeString } from 'inflected';

export type SelectOption = string | Record<string, unknown>;

export interface BottomSheetSelectProps {
    value?: unknown;
    onChange?: (value: unknown) => void;
    onSelect?: (value: unknown) => void;
    options?: SelectOption[];
    /** Key to read the option's value from, when options are objects. */
    optionValue?: string;
    /** Key to read the option's label from, when options are objects. */
    optionLabel?: string;
    renderOption?: (args: { item: SelectOption; index: number; handleSelect: (v: unknown) => void }) => React.ReactElement;
    placeholder?: string;
    searchPlaceholder?: string;
    title?: string;
    portalHost?: string;
    snapTo?: string;
    /** Titleize raw values for display — for enum-ish option lists. */
    humanize?: boolean;
    onBottomSheetPositionChanged?: (isOpen: boolean, fromIndex: number, toIndex: number) => void;
    onBottomSheetOpened?: (isOpen: boolean, fromIndex: number, toIndex: number) => void;
    onBottomSheetClosed?: (isOpen: boolean, fromIndex: number, toIndex: number) => void;
    virtual?: boolean;
    renderInPlace?: boolean;
}

export interface BottomSheetSelectRef {
    openBottomSheet: () => void;
    closeBottomSheet: () => void;
}

const BottomSheetSelect = forwardRef<BottomSheetSelectRef, BottomSheetSelectProps>(
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
        }: BottomSheetSelectProps,
        ref
    ) => {
        const theme = useTheme();
        const [selected, setSelected] = useState(value);
        const [searchTerm, setSearchTerm] = useState('');
        const bottomSheetRef = useRef<React.ComponentRef<typeof BottomSheet> | null>(null);
        const searchInputRef = useRef(null);
        const snapPoints = useMemo(() => [snapTo], [snapTo]);

        // Expose bottomSheetRef to parent components
        const openBottomSheet = useCallback(() => {
            Keyboard.dismiss();
            bottomSheetRef.current?.snapToPosition(snapTo);
        }, [snapTo]);

        const closeBottomSheet = useCallback(() => {
            Keyboard.dismiss();
            bottomSheetRef.current?.close();
        }, []);

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
            return options.filter((option: SelectOption) => {
                const lowerSearch = searchTerm.toLowerCase();
                if (lowerSearch) {
                    if (typeof option === 'string') {
                        return option.toLowerCase().includes(lowerSearch);
                    }

                    // v2 declared these as `optionLabel`/`optionValue`, shadowing the
                    // props and self-referencing in the initializer — a TDZ
                    // ReferenceError on every search over object options.
                    const label = typeof optionLabel === 'string' ? String(option[optionLabel] ?? '') : '';
                    const value = typeof optionValue === 'string' ? String(option[optionValue] ?? '') : '';
                    return value.toLowerCase().includes(lowerSearch) || label.toLowerCase().includes(lowerSearch);
                }

                return true;
            });
        }, [searchTerm, options, optionLabel, optionValue]);

        const handleSelect = useCallback(
            (option: unknown) => {
                setSelected(option);
                closeBottomSheet();

                if (typeof onChange === 'function') {
                    onChange(option);
                }

                if (typeof onSelect === 'function') {
                    onSelect(option);
                }
            },
            [onChange, onSelect, closeBottomSheet]
        );

        const renderSelected = useCallback(() => {
            if (typeof selected === 'string') {
                if (humanize === true) {
                    return titleizeString(selected);
                }
                return selected;
            }

            if (typeof optionLabel === 'string' && isObject(selected)) {
                return String(selected[optionLabel] ?? '');
            }
        }, [selected, optionLabel, humanize]);

        const handleBottomSheetPositionChange = useCallback(
            (fromIndex: number, toIndex: number) => {
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
                    backgroundStyle={{ backgroundColor: theme.background.val, borderWidth: 1, borderColor: theme.border.val }}
                    handleIndicatorStyle={{ backgroundColor: theme.textMuted.val }}
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
                            autoCapitalize="none"
                            autoComplete='off'
                            autoCorrect={false}
                            style={{
                                color: theme.textPrimary.val,
                                backgroundColor: theme.surface.val,
                                borderWidth: 1,
                                borderColor: theme.border.val,
                                padding: 14,
                                borderRadius: 13,
                                fontSize: 13,
                                marginBottom: 10,
                            }}
                        />
                    </YStack>
                    <BottomSheetView
                        style={{ flex: 1, backgroundColor: theme.background.val, paddingHorizontal: 8, borderColor: theme.border.val, borderWidth: 1, borderTopWidth: 0 }}
                    >
                        <BottomSheetFlatList
                            data={filteredOptions}
                            keyExtractor={(item, index) => String(index)}
                            renderItem={({ item, index }) => {
                                if (typeof renderOption === 'function') {
                                    return renderOption({ item, index, handleSelect });
                                }

                                return (
                                    <Button
                                        size='$4'
                                        onPress={() => handleSelect(typeof optionValue === 'string' && isObject(item) ? item[optionValue] : item)}
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
                                        <Text>{typeof optionLabel === 'string' && isObject(item) ? String(item[optionLabel] ?? '') : String(item)}</Text>
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
                    <Button justifyContent='flex-start' textAlign='left' onPress={openBottomSheet} bg='$surface' borderWidth={1} borderColor="$border" borderRadius={radius.compact}>
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
