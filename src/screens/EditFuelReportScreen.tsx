import React, { useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { YStack } from 'tamagui';
import { underscore } from 'inflected';
import { useAuth } from '../contexts/AuthContext';
import { useTempStore } from '../contexts/TempStoreContext';
import { later } from '../utils';
import useFleetbase from '../hooks/use-fleetbase';
import FuelReportForm from '../components/FuelReportForm';

const EditFuelReportScreen = () => {
    const navigation = useNavigation();
    const {
        setValue,
        store: { fuelReport },
    } = useTempStore();
    const { driver } = useAuth();
    const { adapter } = useFleetbase();
    const [isLoading, setIsLoading] = useState(false);

    const handleUpdateReport = useCallback(
        async (fuelReportData) => {
            setIsLoading(true);

            try {
                const updatedFuelReport = await adapter.put(`fuel-reports/${fuelReport.id}`, {
                    ...fuelReportData,
                    driver: driver.id,
                    status: underscore(fuelReport.status),
                });
                setValue('fuelReport', updatedFuelReport);
                later(() => navigation.goBack(), 300);
            } catch (err) {
                console.warn('Error updating fuel report:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [adapter, navigation]
    );

    return (
        <YStack flex={1} bg='$background'>
            <FuelReportForm value={fuelReport} onSubmit={handleUpdateReport} isSubmitting={isLoading} submitText='Update Fuel Report' />
        </YStack>
    );
};

export default EditFuelReportScreen;
