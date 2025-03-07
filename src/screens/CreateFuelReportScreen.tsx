import React, { useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { YStack } from 'tamagui';
import { underscore } from 'inflected';
import { useAuth } from '../contexts/AuthContext';
import useCurrentLocation from '../hooks/use-current-location';
import useFleetbase from '../hooks/use-fleetbase';
import FuelReportForm from '../components/FuelReportForm';

const CreateFuelReportScreen = () => {
    const navigation = useNavigation();
    const { driver } = useAuth();
    const { adapter } = useFleetbase();
    const { liveLocation } = useCurrentLocation();
    const [isLoading, setIsLoading] = useState(false);

    const handleCreateFuelReport = useCallback(
        async (fuelReport) => {
            setIsLoading(true);

            try {
                const newFuelReport = await adapter.post('fuel-reports', {
                    ...fuelReport,
                    driver: driver.id,
                    location: liveLocation ? liveLocation.getAttribute('location') : null,
                    status: underscore(fuelReport.status),
                });
                navigation.goBack();
            } catch (err) {
                console.warn('Error creating new fuel report:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [adapter, liveLocation, navigation]
    );

    return (
        <YStack flex={1} bg='$background'>
            <FuelReportForm onSubmit={handleCreateFuelReport} isSubmitting={isLoading} />
        </YStack>
    );
};

export default CreateFuelReportScreen;
