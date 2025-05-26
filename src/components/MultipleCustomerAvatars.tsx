import React from 'react';
import { Avatar, XStack, Text, useTheme } from 'tamagui';

interface MultipleCustomerAvatarsProps {
    customers: Customer[];
    size?: number;
}

export const MultipleCustomerAvatars: React.FC<MultipleCustomerAvatarsProps> = ({ customers = [], size = 25 }) => {
    // Display a friendly message when no customers exist
    if (customers.length === 0) {
        return (
            <XStack alignItems='center'>
                <Text color='$textPrimary'>No customers</Text>
            </XStack>
        );
    }

    const maxAvatars = 4;
    const displayCustomers = customers.slice(0, maxAvatars);
    const extraCount = customers.length - maxAvatars;
    const hasExtra = extraCount > 0;
    // Overlap factor can be adjusted as needed; here we use 30% of the size.
    const overlapMargin = size * 0.3;

    const shadowStyle = {
        shadowColor: 'rgba(0, 0, 0, 0.25)',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
    };

    return (
        <XStack alignItems='center'>
            {displayCustomers.map((customer, index) => (
                <Avatar key={index} circular size={size} borderWidth={1} borderColor='$gray-900' ml={index === 0 ? 0 : -overlapMargin} style={shadowStyle}>
                    <Avatar.Image accessibilityLabel={customer.name} src={customer.photo_url} />
                    <Avatar.Fallback backgroundColor='$blue-500' />
                </Avatar>
            ))}
            {hasExtra && (
                <Avatar circular size={size} bg='$info' borderWidth={1} borderColor='$infoBorder' ml={-overlapMargin} alignItems='center' justifyContent='center'>
                    <Text color='white' fontSize={size * 0.4} fontWeight='bold'>
                        +{extraCount}
                    </Text>
                </Avatar>
            )}
        </XStack>
    );
};

export default MultipleCustomerAvatars;
