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
import { radius, space } from '../theme/tokens';

/**
 * v2 called `isObject(selected)` in renderSelected() without importing it —
 * a ReferenceError every time a select with object options had a value.
 * Declared locally so this component carries no v2 dependency.
 */
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Label and value for an option, with or without `optionLabel`/`optionValue`.
 *
 * Without them the component used to do `String(item)` on an object option, so
 * a perfectly ordinary `{ label, value }` list rendered nine rows of
 * "[object Object]". An object is never usefully stringified, so the common
 * keys are tried before giving up — an explicit `optionLabel` still wins.
 */
const LABEL_KEYS = ['label', 'name', 'title', 'text'] as const;
const VALUE_KEYS = ['value', 'id', 'key'] as const;

function readOption(item: unknown, key: string | undefined, fallbacks: readonly string[]): string {
    if (!isObject(item)) return item == null ? '' : String(item);
    if (typeof key === 'string') return String(item[key] ?? '');
    for (const candidate of fallbacks) {
        const found = item[candidate];
        if (typeof found === 'string' || typeof found === 'number') return String(found);
    }
    return '';
}

export const labelOf = (item: unknown, optionLabel?: string) => readOption(item, optionLabel, LABEL_KEYS);
export const valueOf = (item: unknown, optionValue?: string) => readOption(item, optionValue, VALUE_KEYS);
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
    testID?: string;
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
            testID,
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
                    const label = labelOf(option, optionLabel);
                    const value = valueOf(option, optionValue);
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
            if (isObject(selected)) {
                return labelOf(selected, optionLabel);
            }

            if (typeof selected === 'string' || typeof selected === 'number') {
                // The value is what gets stored, but the *label* is what was
                // chosen — showing the raw value left the trigger reading
                // "VEHICLE" after picking "Vehicle".
                const match = options.find((option) => valueOf(option, optionValue) === String(selected));
                if (match) return labelOf(match, optionLabel);

                return humanize === true ? titleizeString(String(selected)) : String(selected);
            }

            return '';
        }, [selected, options, optionLabel, optionValue, humanize]);

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
                                        onPress={() => handleSelect(isObject(item) ? valueOf(item, optionValue) : item)}
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
                                        <Text>{labelOf(item, optionLabel)}</Text>
                                    </Button>
                                );
                            }}
                        />
                    </BottomSheetView>
                </BottomSheet>
            );
        };

        return (
            <YStack>
                {/*
                  * The trigger takes an explicit height and padding: this is a
                  * Tamagui Button, and the Waypoint config carries no `size`
                  * scale for it to read a default from, so without them it
                  * collapses and clips its own label. Matched to Field, so a
                  * select and a text input line up.
                  */}
                {virtual === false && (
                    <Button
                        testID={testID}
                        height={50}
                        paddingHorizontal={space[4]}
                        justifyContent='flex-start'
                        textAlign='left'
                        onPress={openBottomSheet}
                        bg='$surface'
                        borderWidth={1}
                        borderColor="$border"
                        borderRadius={radius.compact + 2}
                    >
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
