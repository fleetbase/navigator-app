import SetupWarningScreen from 'exceptions/SetupWarningScreen';
import { useDriver, useMountedState } from 'hooks';
import React, { useEffect } from 'react';
import { ActivityIndicator, SafeAreaView, View } from 'react-native';
import RNBootSplash from 'react-native-bootsplash';
import { EventRegister } from 'react-native-event-listeners';
import { tailwind } from 'tailwind';
import { getColorCode, hasRequiredKeys } from 'utils';
import { setI18nConfig } from 'utils/Localize';

const { addEventListener } = EventRegister;

/**
 * BootScreen is a simple initialization screen, will load
 * the store or network information and navigate to the correct
 * screens.
 *
 * @component
 */
const BootScreen = ({ navigation }) => {
    // If the required keys are not provided display the setup warning screen
    if (!hasRequiredKeys()) {
        return <SetupWarningScreen />;
    }

    // Initialize i18n
    setI18nConfig();

    // Check if driver is authenticated, if not send to login
    const [driver, setDriver] = useDriver();
    const isMounted = useMountedState();

    const checkForAuthenticatedDriver = () => {
        return new Promise((resolve, reject) => {
            if (driver) {
                resolve(driver);
            } else {
                reject(null);
            }
        });
    };

    useEffect(() => {
        checkForAuthenticatedDriver()
            .then(() => {
                return navigation.navigate('MainStack');
            })
            .catch(() => {
                return navigation.navigate('LoginScreen');
            })
            .finally(() => {
                setTimeout(() => {
                    RNBootSplash.hide();
                }, 300);
            });
    }, [isMounted, driver]);

    return (
        <SafeAreaView style={tailwind('bg-gray-900')}>
            <View style={tailwind('flex items-center justify-center w-full h-full bg-gray-900')}>
                <ActivityIndicator size='large' color={getColorCode('text-blue-500')} />
            </View>
        </SafeAreaView>
    );
};

export default BootScreen;
