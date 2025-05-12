import { Text, YStack, XStack } from 'tamagui';
import useAppTheme from '../hooks/use-app-theme';

export const SectionHeader = ({ title, children }) => {
    const { isDarkMode } = useAppTheme();

    return (
        <YStack>
            <XStack
                px='$3'
                py='$3'
                justifyContent='space-between'
                bg={isDarkMode ? '$info' : '$blue-700'}
                borderBottomWidth={1}
                borderTopWidth={1}
                borderColor='$infoBorder'
                shadowColor='$shadowColor'
                shadowOffset={{ width: 0, height: 2 }}
                shadowOpacity={0.2}
                shadowRadius={4}
            >
                <YStack flex={1}>
                    <Text color='$infoText' fontSize={16}>
                        {title}
                    </Text>
                </YStack>
                <YStack>{children}</YStack>
            </XStack>
        </YStack>
    );
};

export const SectionInfoLine = ({ title, value }) => {
    const { isDarkMode } = useAppTheme();

    return (
        <YStack>
            <XStack px='$3' py='$2' justifyContent='space-between'>
                <YStack>
                    <Text color='$textSecondary' fontSize={14}>
                        {title}
                    </Text>
                </YStack>
                <YStack maxWidth='60%'>
                    {typeof value === 'function' ? (
                        value
                    ) : (
                        <Text color='$textPrimary' numberOfLines={1}>
                            {value}
                        </Text>
                    )}
                </YStack>
            </XStack>
        </YStack>
    );
};

export const ActionContainer = ({ children, ...props }) => {
    const { isDarkMode } = useAppTheme();

    return (
        <YStack>
            <YStack
                px='$2'
                py='$4'
                justifyContent='space-between'
                bg='$background'
                borderBottomWidth={0}
                borderTopWidth={1}
                borderColor={isDarkMode ? '$infoBorder' : '$borderColorWithShadow'}
                shadowColor='$shadowColor'
                shadowOffset={{ width: 0, height: 2 }}
                shadowOpacity={0.2}
                shadowRadius={4}
                space='$2'
                flex={1}
                {...props}
            >
                {children}
            </YStack>
        </YStack>
    );
};
