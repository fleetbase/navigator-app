import { useNavigation } from '@react-navigation/native';
import { Text, YStack, XStack, useTheme } from 'tamagui';
import { useLocation } from '../contexts/LocationContext';
import { useOrderManager } from '../contexts/OrderManagerContext';
import { useLanguage } from '../contexts/LanguageContext';
import { get } from '../utils';
import OdometerNumber from '../components/OdometerNumber';
import useAppTheme from '../hooks/use-app-theme';

const WidgetContainer = ({ px = '$4', py = '$4', children, ...props }) => {
    const { isDarkMode } = useAppTheme();
    return (
        <YStack borderRadius='$6' bg='$surface' px={px} py={py} borderWidth={1} borderColor={isDarkMode ? '$transparent' : '$gray-300'} {...props}>
            {children}
        </YStack>
    );
};

const DriverDashboardScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { t } = useLanguage();
    const { isTracking, location } = useLocation();
    const { allActiveOrders } = useOrderManager();

    return (
        <YStack flex={1} bg='$background'>
            <YStack flex={1} padding='$4' gap='$4'>
                <YStack space='$4'>
                    <WidgetContainer>
                        <XStack>
                            <YStack flex={1}>
                                <Text color='$textPrimary'>{t('DriverDashboardScreen.tracking')}</Text>
                            </YStack>
                            <YStack flex={1} alignItems='flex-end'>
                                <Text color={isTracking ? '$successBorder' : '$textSecondary'}>{isTracking ? t('common.yes') : t('common.no')}</Text>
                            </YStack>
                        </XStack>
                    </WidgetContainer>
                    <WidgetContainer>
                        <Text color='$textPrimary' fontWeight='bold' mb='$3'>
                            {t('DriverDashboardScreen.location')}
                        </Text>
                        <XStack flexWrap='wrap' gap='$3'>
                            {['latitude', 'longitude', 'heading', 'altitude'].map((key, index) => {
                                return (
                                    <YStack key={index} width='45%' overflow='hidden'>
                                        <Text color='$textSecondary'>{t(`DriverDashboardScreen.${key}`)}:</Text>
                                        <Text color='$textPrimary' numberOfLines={1}>
                                            {get(location, `coords.${key}`)}
                                        </Text>
                                    </YStack>
                                );
                            })}
                        </XStack>
                    </WidgetContainer>
                </YStack>
                <XStack gap='$4'>
                    <WidgetContainer flex={1} alignItems='center' justifyContent='center'>
                        <YStack>
                            <Text color='$textPrimary' fontWeight='bold' mb='$2'>
                                {t('DriverDashboardScreen.activeOrders')}
                            </Text>
                        </YStack>
                        <YStack>
                            <OdometerNumber value={allActiveOrders.length} digitStyle={{ color: theme['$textSecondary'].val }} digitHeight={36} />
                        </YStack>
                    </WidgetContainer>
                    <WidgetContainer flex={1} alignItems='center' justifyContent='center'>
                        <YStack>
                            <Text color='$textPrimary' fontWeight='bold' mb='$2'>
                                {t('DriverDashboardScreen.speed')}
                            </Text>
                        </YStack>
                        <YStack>
                            <OdometerNumber value={get(location, 'coords.speed', 0)} digitStyle={{ color: theme['$textSecondary'].val }} digitHeight={36} />
                        </YStack>
                    </WidgetContainer>
                </XStack>
            </YStack>
        </YStack>
    );
};

export default DriverDashboardScreen;
