import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FlatList, TextInput, Keyboard } from 'react-native';
import { countries, getEmojiFlag } from 'countries-list';
import BottomSheet, { BottomSheetView, BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useTheme, View, Text, Button, XStack, YStack, Input } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPenToSquare } from '@fortawesome/free-solid-svg-icons';
import { Portal } from '@gorhom/portal';
import { debounce } from '../utils';
import unit from '../constants/Units';

const getDefaultUnit = (type, defaultValue) => {
    if (typeof type === 'string' && type.startsWith('volume')) {
        return unit.volumes.find((x) => x.value === defaultValue) ? defaultValue : unit.volumes[0];
    }
    if (typeof type === 'string' && type.startsWith('size')) {
        return unit.sizes.find((x) => x.value === defaultValue) ? defaultValue : unit.sizes[0];
    }
    if (typeof type === 'string' && type.startsWith('weight')) {
        return unit.weights.find((x) => x.value === defaultValue) ? defaultValue : unit.weights[0];
    }
    return defaultValue;
};

const UnitInput = ({
    value: _value,
    onChange,
    width = '100%',
    defaultUnit = 'L',
    type = 'volume',
    snapTo = '100%',
    backgroundColor = '$surface',
    placeholder = 'Input volume',
    wrapperProps = {},
    portalHost = 'MainPortal',
    onBottomSheetPositionChanged,
    onBottomSheetOpened,
    onBottomSheetClosed,
}) => {
    const theme = useTheme();
    const [selectedUnit, setSelectedUnit] = useState(getDefaultUnit(type, defaultUnit));
    const [value, setValue] = useState(_value);
    const [searchTerm, setSearchTerm] = useState('');
    const bottomSheetRef = useRef(null);
    const valueInputRef = useRef(null);
    const searchInputRef = useRef(null);
    const prevOutputRef = useRef(null);

    // Ensure snapPoints update if snapTo changes
    const snapPoints = useMemo(() => [snapTo], [snapTo]);

    // Determine available units based on type
    const units = useMemo(() => {
        if (typeof type === 'string' && type.startsWith('volume')) return unit.volumes;
        if (typeof type === 'string' && type.startsWith('size')) return unit.sizes;
        if (typeof type === 'string' && type.startsWith('weight')) return unit.weights;
        return unit.volumes;
    }, [type]);

    // Find the selected unit object (now depends on both selectedUnit and type)
    const selectedUnitObject = useMemo(() => {
        if (typeof type === 'string' && type.startsWith('volume')) return unit.volumes.find((x) => x.value === selectedUnit);
        if (typeof type === 'string' && type.startsWith('size')) return unit.sizes.find((x) => x.value === selectedUnit);
        if (typeof type === 'string' && type.startsWith('weight')) return unit.weights.find((x) => x.value === selectedUnit);
        return unit.volumes.find((x) => x.value === selectedUnit);
    }, [selectedUnit, type]);

    // Filter units based on search term—also depend on `units`
    const filteredUnits = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();
        return units.filter((unit) => {
            return unit.name.toLowerCase().includes(lowerSearch) || unit.value.toLowerCase().includes(lowerSearch);
        });
    }, [searchTerm, units]);

    const openBottomSheet = useCallback(() => {
        valueInputRef.current?.blur();
        bottomSheetRef.current?.snapToPosition(snapTo);
    }, [snapTo]);

    const closeBottomSheet = useCallback(() => {
        Keyboard.dismiss();
        bottomSheetRef.current?.close();
        valueInputRef.current?.focus();
    }, []);

    const handleInputFocus = useCallback(() => {
        bottomSheetRef.current?.close();
    }, []);

    const handleUnitSelect = useCallback(
        (unitValue) => {
            setSelectedUnit(unitValue);
            closeBottomSheet();
        },
        [closeBottomSheet]
    );

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

    useEffect(() => {
        if (value && onChange) {
            const newOutput = { value, unit: selectedUnit };
            if (JSON.stringify(prevOutputRef.current) !== JSON.stringify(newOutput)) {
                prevOutputRef.current = newOutput;
                onChange(newOutput);
            }
        }
    }, [selectedUnit, value, onChange]);

    return (
        <YStack {...wrapperProps}>
            <XStack
                width='100%'
                alignItems='center'
                paddingHorizontal={0}
                shadowOpacity={0}
                shadowRadius={0}
                borderWidth={1}
                borderColor='$borderColor'
                borderRadius='$5'
                bg={backgroundColor}
            >
                <Input
                    ref={valueInputRef}
                    flex={1}
                    placeholder={placeholder}
                    keyboardType='phone-pad'
                    value={value}
                    onChangeText={setValue}
                    onFocus={handleInputFocus}
                    bg={backgroundColor}
                    color='$textPrimary'
                    borderRadius={0}
                    borderTopLeftRadius='$3'
                    borderBottomLeftRadius='$3'
                    overflow='hidden'
                />
                <YStack padding='$2'>
                    <Button
                        alignSelf='flex-start'
                        justifyContent='flex-end'
                        flexGrow={0}
                        onPress={openBottomSheet}
                        bg='$info'
                        borderWidth={1}
                        borderColor='$infoBorder'
                        borderRadius='$5'
                        height={30}
                    >
                        <Button.Icon>
                            <FontAwesomeIcon icon={faPenToSquare} color={theme.infoText.val} />
                        </Button.Icon>
                        <Button.Text color='$infoText' fontSize={15} numberOfLines={1}>
                            {selectedUnitObject?.name || ''}
                        </Button.Text>
                    </Button>
                </YStack>
            </XStack>

            <Portal hostName={portalHost}>
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
                    backgroundStyle={{
                        backgroundColor: theme.background.val,
                        borderWidth: 1,
                        borderColor: theme.borderColorWithShadow.val,
                    }}
                    handleIndicatorStyle={{ backgroundColor: theme.secondary.val }}
                >
                    <YStack px='$2'>
                        <BottomSheetTextInput
                            ref={searchInputRef}
                            placeholder='Search unit'
                            onChangeText={setSearchTerm}
                            autoCapitalize='none'
                            autoComplete='off'
                            autoCorrect={false}
                            style={{
                                color: theme.textPrimary.val,
                                backgroundColor: theme.surface.val,
                                borderWidth: 1,
                                borderColor: theme.borderColor.val,
                                padding: 14,
                                borderRadius: 12,
                                fontSize: 13,
                                marginBottom: 10,
                            }}
                        />
                    </YStack>
                    <BottomSheetView
                        style={{
                            flex: 1,
                            backgroundColor: theme.background.val,
                            paddingHorizontal: 8,
                            borderColor: theme.borderColorWithShadow.val,
                            borderWidth: 1,
                            borderTopWidth: 0,
                        }}
                    >
                        <BottomSheetFlatList
                            data={filteredUnits}
                            keyExtractor={(item) => item.value}
                            renderItem={({ item }) => (
                                <Button
                                    size='$4'
                                    onPress={() => handleUnitSelect(item.value)}
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
                                    <XStack alignItems='center' space='$2'>
                                        <Text color='$textPrimary'>{item.name}</Text>
                                        <Text color='$textPrimary' textTransform='italic'>
                                            ({item.value})
                                        </Text>
                                    </XStack>
                                </Button>
                            )}
                        />
                    </BottomSheetView>
                </BottomSheet>
            </Portal>
        </YStack>
    );
};

export default UnitInput;
