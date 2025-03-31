import { useEffect, useCallback } from 'react';
import { Linking } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useConfig } from '../contexts/ConfigContext';
import { setString } from '../hooks/use-storage';
import { get } from '../utils';
import { toast } from '../utils/toast';

function getUrlParams(url) {
    const params = {};

    // Extract query string portion after the "?"
    const queryStart = url.indexOf('?');
    if (queryStart === -1) return params;

    const queryString = url.slice(queryStart + 1);
    const pairs = queryString.split('&');

    for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key) {
            params[decodeURIComponent(key)] = decodeURIComponent(value || '');
        }
    }

    return params;
}

const InstanceLinkHandler = ({}) => {
    const { logout } = useAuth();
    const { setInstanceLinkConfig } = useConfig();

    const handleSetupInstanceLink = useCallback(
        (url) => {
            const config = getUrlParams(url);

            // Set config to memory
            setInstanceLinkConfig('FLEETBASE_KEY', get(config, 'key'));
            setInstanceLinkConfig('FLEETBASE_HOST', get(config, 'host'));
            setInstanceLinkConfig('SOCKETCLUSTER_HOST', get(config, 'socketcluster_host'));
            setInstanceLinkConfig('SOCKETCLUSTER_PORT', get(config, 'socketcluster_port', '8000'));
            setInstanceLinkConfig('SOCKETCLUSTER_SECURE', get(config, 'socketcluster_secure', 'true'));

            // Logout then reboot app
            logout();

            // Notify
            toast.success('Instance link was successful!');
        },
        [logout, setInstanceLinkConfig]
    );

    useEffect(() => {
        Linking.addEventListener('url', ({ url }) => {
            console.log('[URL EVENT FIRED!]', url);
            if (typeof url === 'string' && url.startsWith('flbnavigator://configure')) {
                handleSetupInstanceLink(url);
            }
        });
    }, []);
};

export default InstanceLinkHandler;
