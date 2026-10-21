import { useState, useEffect } from 'react';
import { authorize } from 'react-native-app-auth';
import { config } from '../utils';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import { toast, ToastPosition } from '@backpackapp-io/react-native-toast';
import useFleetbase from '../hooks/use-fleetbase';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { translate } from '../utils/localize';

const APP_LINK_PREFIX = config('APP_LINK_PREFIX');

const useOAuth = () => {
    const { adapter } = useFleetbase();
    const { createCustomerSession } = useAuth();
    const [authState, setAuthState] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const login = async (provider) => {
        if (provider === 'apple') {
            const result = await appleLogin();
            setAuthState(result);
            return result;
        }

        if (provider === 'google') {
            const result = await googleLogin();
            setAuthState(result);
            return result;
        }

        throw new Error('Invalid OAuth provider.');
    };

    const appleLogin = async () => {
        setLoading(true);
        setError(null);

        try {
            if (!appleAuth.isSupported) {
                return toast.error(translate('useOAuth.appleNotSupported'));
            }

            // Perform Apple Sign-In
            const appleAuthResponse = await appleAuth.performRequest({
                requestedOperation: appleAuth.Operation.LOGIN,
                requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
            });
            console.log('[appleAuthResponse]', appleAuthResponse);

            const { identityToken, authorizationCode, email, fullName, user: appleUserId } = appleAuthResponse;
            if (!identityToken || !authorizationCode) {
                return toast.error(translate('useOAuth.appleMissingToken'));
            }

            // Get the user's name
            const name = fullName.givenName ?? fullName.nickname ?? fullName.familyName;

            // Login customer with apple credentials
            const customerJson = await storefront.customers.loginWithApple(appleUserId, identityToken, authorizationCode, email, name);

            const customer = createCustomerSession(customerJson);
            return customer;
        } catch (err) {
            setError(err.message);
            setLoading(false);
            console.warn('Apple Sign-In error:', err);
        } finally {
            setLoading(false);
        }
    };

    const googleLogin = async () => {
        setLoading(true);
        setError(null);

        try {
            // Perform Google Sign-In
            await GoogleSignin.hasPlayServices();
            const googleAuthResponse = await GoogleSignin.signIn();
            console.log('[googleAuthResponse]', googleAuthResponse);

            const { idToken, user } = googleAuthResponse.data;
            const customerJson = await adapter.post('customers/login-with-google', {
                idToken,
                clientId: `${config('GOOGLE_CLIENT_ID')}.apps.googleusercontent.com`,
            });

            const customer = createCustomerSession(customerJson);
            return customer;
        } catch (err) {
            setError(err.message);
            setLoading(false);
            console.warn('Google Sign-In error:', err);
        } finally {
            setLoading(false);
        }
    };

    const loginSupported = (provider) => {
        if (provider === 'apple') {
            return appleAuth.isSupported;
        }

        if (provider === 'google') {
            return typeof config('GOOGLE_CLIENT_ID') === 'string';
        }
    };

    useEffect(() => {
        if (loginSupported('google')) {
            GoogleSignin.configure({
                webClientId: `${config('GOOGLE_CLIENT_ID')}.apps.googleusercontent.com`,
                iosClientId: `${config('GOOGLE_IOS_CLIENT_ID')}.apps.googleusercontent.com`,
                offlineAccess: true,
            });
        }
    }, []);

    return {
        authState,
        loading,
        error,
        login,
        appleLogin,
        loginSupported,
        appleLoginIsSupported: loginSupported('apple'),
        googleLoginIsSupported: loginSupported('google'),
    };
};

export default useOAuth;
