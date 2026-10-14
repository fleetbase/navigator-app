import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import socketClusterClient from 'socketcluster-client';
import DeviceInfo from 'react-native-device-info';
import { consumeAsyncIterator } from '../utils';
import { useConfig } from './ConfigContext';
import { useAuth } from './AuthContext';
import useFleetbase from '../hooks/use-fleetbase';
import { createSocketAuth, socketClientTag } from '../services/socket-auth';

const SocketClusterContext = createContext(null);

// Auth session of each socket, so channel bookkeeping always lands on the session of the socket it belongs to.
const socketAuthBySocket = new WeakMap();

/**
 * SocketClusterProvider component that initializes the socket connection
 * and provides socket-related functionalities to its children.
 */
export const SocketClusterProvider = ({ children }) => {
    const { resolveConnectionConfig } = useConfig();
    const { authToken, sessionEpoch } = useAuth();
    const { adapter } = useFleetbase();
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState(null);

    const socketHost = resolveConnectionConfig('SOCKETCLUSTER_HOST');
    const socketPort = resolveConnectionConfig('SOCKETCLUSTER_PORT');
    const socketPath = resolveConnectionConfig('SOCKETCLUSTER_PATH');
    const socketSecure = resolveConnectionConfig('SOCKETCLUSTER_SECURE');
    const apiHost = adapter?.host ?? resolveConnectionConfig('FLEETBASE_HOST');
    const apiNamespace = adapter?.namespace ?? 'v1';

    // (Re)create the socket whenever the instance, the driver session or its organization changes, so the
    // handshake always carries a socket token for the current driver (or none when signed out).
    useEffect(() => {
        const socketAuth = createSocketAuth({ host: apiHost, namespace: apiNamespace, authToken });

        // Initialize the socket connection
        const options = {
            hostname: socketHost,
            port: socketPort,
            path: socketPath,
            secure: socketSecure,
            authEngine: socketAuth.authEngine,
            query: { client: socketClientTag(DeviceInfo.getVersion()) },
        };

        const scSocket = socketClusterClient.create(options);
        socketAuth.attach(scSocket);
        socketAuthBySocket.set(scSocket, socketAuth);

        // Define handlers for socket events
        const handleConnect = () => {
            setIsConnected(true);
            console.log('Socket connected.');
        };

        const handleDisconnect = () => {
            setIsConnected(false);
            console.log('Socket disconnected.');
        };

        const handleError = (err) => {
            setError(err);
            console.warn('Socket encountered error:', err);
        };

        // Attach event listeners using AsyncIterator
        const connectListener = scSocket.listener('connect');
        const disconnectListener = scSocket.listener('disconnect');
        const errorListener = scSocket.listener('error');

        // Start consuming the AsyncIterators
        const stopConnect = consumeAsyncIterator(connectListener, handleConnect, handleError);
        const stopDisconnect = consumeAsyncIterator(disconnectListener, handleDisconnect, handleError);
        const stopError = consumeAsyncIterator(errorListener, handleError, handleError);

        setSocket(scSocket);

        // Cleanup on unmount
        return () => {
            // Stop all iterations
            stopConnect();
            stopDisconnect();
            stopError();

            socketAuth.destroy();
            socketAuthBySocket.delete(scSocket);

            scSocket.disconnect();
            setIsConnected(false);
            console.log('Socket connection closed.');
        };
    }, [socketHost, socketPort, socketPath, socketSecure, apiHost, apiNamespace, authToken, sessionEpoch]);

    /**
     * Subscribes to a specific channel.
     * @param {string} channelName - The name of the channel to subscribe to.
     * @returns {Channel|null} The subscribed channel instance or null if subscription fails.
     */
    const subscribeChannel = useCallback(
        async (channelName) => {
            if (!socket) {
                console.warn('Socket not initialized.');
                return null;
            }

            try {
                socketAuthBySocket.get(socket)?.track(channelName);
                const channel = socket.subscribe(channelName);
                if (channel.isSubscribed()) {
                    console.log(`Already subscribed to channel "${channelName}".`);
                    return channel;
                }

                // Wait for the subscription to settle either way. On failure the channel is still returned:
                // the socket auth session retries it with a fresh token and data then flows to the same iterator.
                const subscribed = await Promise.race([
                    channel
                        .listener('subscribe')
                        .once()
                        .then(() => true),
                    channel
                        .listener('subscribeFail')
                        .once()
                        .then(() => false),
                ]);
                console.log(subscribed ? `Subscribed to channel "${channelName}".` : `Subscription to channel "${channelName}" was rejected; retrying with a fresh token.`);
                return channel;
            } catch (err) {
                console.warn(`Failed to subscribe to channel "${channelName}":`, err);
                return null;
            }
        },
        [socket]
    );

    /**
     * Closes a specific channel gracefully.
     * @param {string} channelName - The name of the channel to close.
     */
    const closeChannel = useCallback(
        async (channelName) => {
            if (!socket) {
                console.warn('Socket not initialized.');
                return;
            }

            socketAuthBySocket.get(socket)?.untrack(channelName);
            try {
                await socket.closeChannel(channelName);
                console.log(`Gracefully closed channel "${channelName}".`);
            } catch (err) {
                console.warn(`Error while closing channel "${channelName}":`, err);
            }
        },
        [socket]
    );

    /**
     * Forcefully kills a specific channel immediately.
     * @param {string} channelName - The name of the channel to kill.
     */
    const killChannel = useCallback(
        async (channelName) => {
            if (!socket) {
                console.warn('Socket not initialized.');
                return;
            }

            socketAuthBySocket.get(socket)?.untrack(channelName);
            try {
                await socket.killChannel(channelName);
                console.log(`Forcefully killed channel "${channelName}".`);
            } catch (err) {
                console.warn(`Error while killing channel "${channelName}":`, err);
            }
        },
        [socket]
    );

    /**
     * Closes all channels gracefully.
     */
    const closeAllChannels = useCallback(async () => {
        if (!socket) {
            console.warn('Socket not initialized.');
            return;
        }

        socketAuthBySocket.get(socket)?.untrackAll();
        try {
            await socket.closeAllChannels();
            console.log('Gracefully closed all channels.');
        } catch (err) {
            console.warn('Error while closing all channels:', err);
        }
    }, [socket]);

    /**
     * Forcefully kills all channels immediately.
     */
    const killAllChannels = useCallback(async () => {
        if (!socket) {
            console.warn('Socket not initialized.');
            return;
        }

        socketAuthBySocket.get(socket)?.untrackAll();
        try {
            await socket.killAllChannels();
            console.log('Forcefully killed all channels.');
        } catch (err) {
            console.warn('Error while killing all channels:', err);
        }
    }, [socket]);

    return (
        <SocketClusterContext.Provider
            value={{
                socket,
                isConnected,
                error,
                subscribeChannel,
                closeChannel,
                killChannel,
                closeAllChannels,
                killAllChannels,
            }}
        >
            {children}
        </SocketClusterContext.Provider>
    );
};

/**
 * Custom hook to access the SocketClusterContext.
 * @returns {Object} The socket context value.
 */
export const useSocketCluster = () => {
    return useContext(SocketClusterContext);
};
