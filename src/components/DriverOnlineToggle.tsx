import { useState, useEffect } from 'react';
import { Switch, Label, XStack } from 'tamagui';
import { useAuth } from '../contexts/AuthContext';
import useAppTheme from '../hooks/use-app-theme';

const DriverOnlineToggle = ({ showLabel = false, ...props }) => {
    const { isDarkMode } = useAppTheme();
    const { isOnline, toggleOnline, isUpdating } = useAuth();
    const [checked, setChecked] = useState(isOnline);

    const onCheckedChange = async (checked) => {
        setChecked(checked);

        try {
            const { isOnline } = await toggleOnline(checked);
            setChecked(isOnline);
        } catch (err) {
            console.warn('Error attempting to change driver online status:', err);
        }
    };

    useEffect(() => {
        setChecked(isOnline);
    }, [isOnline]);

    return (
        <XStack alignItems='center' gap='$2'>
            <Switch
                id='driverOnline'
                checked={checked}
                onCheckedChange={onCheckedChange}
                disabled={isUpdating}
                opacity={isUpdating ? 0.75 : 1}
                bg={checked ? '$green-600' : '$gray-500'}
                borderWidth={1}
                borderColor={isDarkMode ? '$gray-700' : '$white'}
            >
                <Switch.Thumb animation='quick' bg={isDarkMode ? '$gray-200' : '$white'} borderColor={isDarkMode ? '$gray-700' : '$gray-500'} borderWidth={1} />
            </Switch>
            {showLabel === true && (
                <Label htmlFor='driverOnline' color='$gray-500' size='$2' lineHeight='$4'>
                    {checked ? 'Online' : 'Offline'}
                </Label>
            )}
        </XStack>
    );
};

export default DriverOnlineToggle;
