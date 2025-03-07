import React, { useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { YStack } from 'tamagui';
import { underscore } from 'inflected';
import { useAuth } from '../contexts/AuthContext';
import useCurrentLocation from '../hooks/use-current-location';
import useFleetbase from '../hooks/use-fleetbase';
import IssueForm from '../components/IssueForm';

const CreateIssueScreen = () => {
    const navigation = useNavigation();
    const { driver } = useAuth();
    const { adapter } = useFleetbase();
    const { liveLocation } = useCurrentLocation();
    const [isLoading, setIsLoading] = useState(false);

    const handleCreateIssue = useCallback(
        async (issue) => {
            setIsLoading(true);

            try {
                const newIssue = await adapter.post('issues', {
                    ...issue,
                    driver: driver.id,
                    location: liveLocation ? liveLocation.getAttribute('location') : null,
                    type: underscore(issue.type),
                    priority: underscore(issue.priority),
                    status: underscore(issue.status),
                });
                navigation.goBack();
            } catch (err) {
                console.warn('Error creating new issue:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [adapter, liveLocation, navigation]
    );

    return (
        <YStack flex={1} bg='$background'>
            <IssueForm onSubmit={handleCreateIssue} isSubmitting={isLoading} />
        </YStack>
    );
};

export default CreateIssueScreen;
