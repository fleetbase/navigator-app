import React, { useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { YStack } from 'tamagui';
import { useAuth } from '../contexts/AuthContext';
import { useTempStore } from '../contexts/TempStoreContext';
import { later } from '../utils';
import useFleetbase from '../hooks/use-fleetbase';
import IssueForm from '../components/IssueForm';

const EditIssueScreen = () => {
    const navigation = useNavigation();
    const {
        setValue,
        store: { issue },
    } = useTempStore();
    const { driver } = useAuth();
    const { adapter } = useFleetbase();
    const [isLoading, setIsLoading] = useState(false);

    const handleSaveIssue = useCallback(
        async (issueData) => {
            setIsLoading(true);

            try {
                const updatedIssue = await adapter.put(`issues/${issue.id}`, {
                    ...issueData,
                    driver: driver.id,
                });
                setValue('issue', updatedIssue);
                later(() => navigation.goBack(), 300);
            } catch (err) {
                console.warn('Error updating issue:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [adapter, driver, navigation, setValue]
    );

    return (
        <YStack flex={1} bg='$background'>
            <IssueForm value={issue} onSubmit={handleSaveIssue} isSubmitting={isLoading} submitText='Save Issue' />
        </YStack>
    );
};

export default EditIssueScreen;
