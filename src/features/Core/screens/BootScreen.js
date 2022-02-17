import React, { useEffect } from 'react';
import { SafeAreaView, View, ActivityIndicator } from 'react-native';
import { hasRequiredKeys, logError } from 'utils';
import { useDriver, useMountedState } from 'hooks';
import { set } from 'utils/Storage';
import { setI18nConfig } from 'utils/Localize';
import { tailwind } from 'tailwind';
import RNBootSplash from 'react-native-bootsplash';
import SetupWarningScreen from 'exceptions/SetupWarningScreen';
import config from 'config';

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
                console.log('logged in as', driver);
                return navigation.navigate('MainScreen');
            })
            .catch(() => {
                return navigation.navigate('LoginScreen');
            })
            .finally(() => {
                setTimeout(() => {
                    RNBootSplash.hide();
                }, 300);
            });
    }, [isMounted]);

    return (
        <SafeAreaView style={tailwind('bg-gray-900')}>
            <View style={tailwind('flex items-center justify-center w-full h-full bg-gray-900')}>
                <ActivityIndicator size="large" color={tailwind('text-gray-50')} />
            </View>
        </SafeAreaView>
    );
};

export default BootScreen;
