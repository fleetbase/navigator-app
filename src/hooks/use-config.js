import config from 'config';
import { getString } from 'utils/Storage';

let { SOCKETCLUSTER_PORT, SOCKETCLUSTER_HOST, FLEETBASE_HOST } = config;

const useConfig = () => {
    let _FLEETBASE_HOST = getString('_FLEETBASE_HOST');
    let _SOCKET_HOST = getString('_SOCKET_HOST');
    let _SOCKET_PORT = getString('_SOCKET_PORT');

    console.log('inni:::::', _FLEETBASE_HOST, _SOCKET_HOST, _SOCKET_PORT);

    if (_FLEETBASE_HOST) {
        FLEETBASE_HOST = _FLEETBASE_HOST;
    }

    if (_SOCKET_HOST) {
        SOCKETCLUSTER_HOST = _SOCKET_HOST;
    }

    if (_SOCKET_PORT) {
        SOCKETCLUSTER_PORT = _SOCKET_PORT;
    }

    return { FLEETBASE_HOST, SOCKETCLUSTER_HOST, SOCKETCLUSTER_PORT };
};

export default useConfig;
