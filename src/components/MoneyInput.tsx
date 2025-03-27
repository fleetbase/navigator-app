import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FlatList, TextInput, Keyboard } from 'react-native';
import { countries, getEmojiFlag } from 'countries-list';
import BottomSheet, { BottomSheetView, BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useTheme, View, Text, Button, XStack, YStack, Input } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPenToSquare } from '@fortawesome/free-solid-svg-icons';
import { Portal } from '@gorhom/portal';
import { debounce } from '../utils';
import { currencies, getCurrency } from '../utils/currencies';

const MoneyInput = ({
    value: _value,
    onChange,
    width = '100%',
    defaultCurrency = 'USD',
    type = 'volume',
    snapTo = '100%',
    backgroundColor = '$surface',
    placeholder = 'Input amount',
    wrapperProps = {},
    portalHost = 'MainPortal',
    onBottomSheetPositionChanged,
    onBottomSheetOpened,
    onBottomSheetClosed,
}) => {
    const theme = useTheme();
    const [selectedCurrency, setSelectedCurrency] = useState(defaultCurrency);
    const [value, setValue] = useState(_value);
    const [searchTerm, setSearchTerm] = useState('');
    const bottomSheetRef = useRef(null);
    const valueInputRef = useRef(null);
    const searchInputRef = useRef(null);
    const prevOutputRef = useRef(null);

    // Ensure snapPoints update if snapTo changes
    const snapPoints = useMemo(() => [snapTo], [snapTo]);

    // Find the selected currency object
    const selectedCurrencyObject = useMemo(() => {
        return getCurrency(selectedCurrency);
    }, [selectedCurrency]);

    // Filter units based on search term—also depend on `units`
    const filteredCurrencies = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();
        return currencies.filter((currency) => {
            return currency.name.toLowerCase().includes(lowerSearch) || currency.title.toLowerCase().includes(lowerSearch) || currency.code.toLowerCase().includes(lowerSearch);
        });
    }, [searchTerm]);

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
            setSelectedCurrency(unitValue);
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
            const newOutput = { value, currency: selectedCurrency };
            if (JSON.stringify(prevOutputRef.current) !== JSON.stringify(newOutput)) {
                prevOutputRef.current = newOutput;
                onChange(newOutput);
            }
        }
    }, [selectedCurrency, value, onChange]);

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
                <XStack alignItems='center' justifyContent='flex-end' pl='$4'>
                    <Text fontSize={14} numberOfLines={1}>
                        {selectedCurrencyObject.symbol}
                    </Text>
                </XStack>
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
                    pl={5}
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
                            {selectedCurrency}
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
                            placeholder='Search currencies'
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
                            data={filteredCurrencies}
                            keyExtractor={(item) => item.code}
                            renderItem={({ item }) => (
                                <Button
                                    size='$4'
                                    onPress={() => handleUnitSelect(item.code)}
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
                                        <Text>{item.emoji}</Text>
                                        <Text>{item.code}</Text>
                                    </XStack>
                                    <Text>{item.title}</Text>
                                </Button>
                            )}
                        />
                    </BottomSheetView>
                </BottomSheet>
            </Portal>
        </YStack>
    );
};

export default MoneyInput;
