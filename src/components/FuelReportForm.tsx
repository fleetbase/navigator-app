import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Text, YStack, Button, Spinner, Input, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faSave } from '@fortawesome/free-solid-svg-icons';
import { PortalHost } from '@gorhom/portal';
import { underscore } from 'inflected';
import { uppercase } from '../utils/format';
import { getDriverFuelReportStatuses, FuelReportStatus } from '../constants/Enums';
import BottomSheetSelect from '../components/BottomSheetSelect';
import UnitInput from '../components/UnitInput';
import MoneyInput from '../components/MoneyInput';

const FuelReportForm = ({ value = {}, onSubmit, isSubmitting = false, submitText = 'Publish Fuel Report' }) => {
    const theme = useTheme();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const [fuelReport, setFuelReport] = useState({
        status: FuelReportStatus.DRAFT,
        odometer: '',
        volume: '',
        cost: '',
        currency: 'USD',
        ...value,
    });
    const [isBottomSheetPresenting, setIsBottomSheetPresenting] = useState(false);

    const isValid = useMemo(() => {
        return !!fuelReport.status && !!fuelReport.odometer && !!fuelReport.volume && !!fuelReport.amount;
    }, [fuelReport.status, fuelReport.odometer, fuelReport.volume, fuelReport.amount]);

    const handleUpdateFuelReport = (key, value) => {
        setFuelReport((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    const handleSubmit = useCallback(() => {
        if (onSubmit && isValid) {
            const formattedFuelReport = {
                ...fuelReport,
                status: underscore(fuelReport.status),
            };
            onSubmit(formattedFuelReport);
        }
    }, [onSubmit, isValid, fuelReport]);

    useEffect(() => {
        navigation.setOptions({
            gestureEnabled: !isBottomSheetPresenting,
        });
    }, [isBottomSheetPresenting]);

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <YStack flex={1}>
                <YStack py='$3' space='$4'>
                    <YStack px='$3' space='$2'>
                        <Text color='$textPrimary' fontSize={18} fontWeight='bold' px='$1'>
                            Status
                        </Text>
                        <BottomSheetSelect
                            value={fuelReport.status}
                            options={getDriverFuelReportStatuses()}
                            optionLabel='value'
                            optionValue='key'
                            onChange={(value) => handleUpdateFuelReport('status', value)}
                            title='Select Fuel Report Status'
                            humanize={true}
                            portalHost='FuelReportFormPortal'
                            snapTo='100%'
                            onBottomSheetPositionChanged={setIsBottomSheetPresenting}
                        />
                    </YStack>
                    <YStack px='$3' space='$2'>
                        <Text color='$textPrimary' fontSize={18} fontWeight='bold' px='$1'>
                            Odometer
                        </Text>
                        <Input
                            value={fuelReport.odometer}
                            onChangeText={(text) => handleUpdateFuelReport('odometer', text)}
                            keyboardType='phone-pad'
                            placeholder='Input your current odometer...'
                            borderWidth={1}
                            color='$textPrimary'
                            borderColor='$borderColor'
                            borderRadius='$5'
                            bg='$surface'
                        />
                    </YStack>
                    <YStack px='$3' space='$2'>
                        <Text color='$textPrimary' fontSize={18} fontWeight='bold' px='$1'>
                            Volume
                        </Text>
                        <UnitInput
                            value={fuelReport.volume}
                            onChange={({ value, unit }) => {
                                handleUpdateFuelReport('volume', value);
                                handleUpdateFuelReport('metric_unit', unit);
                            }}
                            placeholder='Input fuel volume...'
                            portalHost='FuelReportFormPortal'
                            onBottomSheetPositionChanged={setIsBottomSheetPresenting}
                        />
                    </YStack>
                    <YStack px='$3' space='$2'>
                        <Text color='$textPrimary' fontSize={18} fontWeight='bold' px='$1'>
                            Cost
                        </Text>
                        <MoneyInput
                            value={fuelReport.amount}
                            defaultCurrency={fuelReport.currency}
                            onChange={({ value, currency }) => {
                                handleUpdateFuelReport('amount', value);
                                handleUpdateFuelReport('currency', currency);
                            }}
                            placeholder='Input fuel costs...'
                            portalHost='FuelReportFormPortal'
                            onBottomSheetPositionChanged={setIsBottomSheetPresenting}
                        />
                    </YStack>
                </YStack>
                <YStack bg='$background' position='absolute' bottom={insets.bottom} left={0} right={0} borderTopWidth={1} borderColor='$borderColor'>
                    <YStack px='$2' py='$4'>
                        <Button
                            onPress={handleSubmit}
                            bg='$info'
                            borderWidth={1}
                            borderColor='$infoBorder'
                            height={50}
                            disabled={isSubmitting || !isValid}
                            opacity={isSubmitting || !isValid ? 0.6 : 1}
                        >
                            <Button.Icon>{isSubmitting ? <Spinner color='$infoText' /> : <FontAwesomeIcon icon={faSave} color={theme['$infoText'].val} size={16} />}</Button.Icon>
                            <Button.Text color='$infoText' fontSize={15}>
                                {submitText}
                            </Button.Text>
                        </Button>
                    </YStack>
                </YStack>
                <PortalHost name='FuelReportFormPortal' />
            </YStack>
        </TouchableWithoutFeedback>
    );
};

export default FuelReportForm;
