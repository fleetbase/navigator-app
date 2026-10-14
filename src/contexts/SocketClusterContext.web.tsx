import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import socketClusterClient from 'socketcluster-client';
import { useConfig } from './ConfigContext';
import { useAuth } from './AuthContext';
import useFleetbase from '../hooks/use-fleetbase';
import { createSocketAuth, socketClientTag } from '../services/socket-auth';
import packageJson from '../../package.json';

const SocketClusterContext = createContext(null);

// Auth session of each socket, so channel bookkeeping always lands on the session of the socket it belongs to.
const socketAuthBySocket = new WeakMap();

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
            query: { client: socketClientTag(packageJson?.version) },
        };

        const scSocket = socketClusterClient.create(options);
        socketAuth.attach(scSocket);
        socketAuthBySocket.set(scSocket, socketAuth);

        // Listen for socket events using async iterators
        (async () => {
            try {
                for await (let event of scSocket.listener('connect')) {
                    setIsConnected(true);
                    console.log('Socket connected.');
                }
            } catch (err) {
                console.warn('Error in connect listener:', err);
            }
        })();

        (async () => {
            try {
                for await (let event of scSocket.listener('disconnect')) {
                    setIsConnected(false);
                    console.log('Socket disconnected.');
                }
            } catch (err) {
                console.warn('Error in disconnect listener:', err);
            }
        })();

        (async () => {
            try {
                for await (let err of scSocket.listener('error')) {
                    setError(err);
                    console.warn('Socket error:', err);
                }
            } catch (err) {
                console.warn('Error in error listener:', err);
            }
        })();

        setSocket(scSocket);

        return () => {
            socketAuth.destroy();
            socketAuthBySocket.delete(scSocket);
            scSocket.disconnect();
            setIsConnected(false);
            console.log('Socket connection closed.');
        };
    }, [socketHost, socketPort, socketPath, socketSecure, apiHost, apiNamespace, authToken, sessionEpoch]);

    /**
     * Subscribes to a channel and listens for its events using async iterators.
     * Returns the channel if successful.
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

                // Listen for the subscription confirmation.
                (async () => {
                    try {
                        for await (let event of channel.listener('subscribe')) {
                            console.log(`Subscribed to channel "${channelName}".`);
                            // Break out after the first event if you prefer.
                            break;
                        }
                    } catch (err) {
                        console.warn(`Error in channel "${channelName}" subscribe listener:`, err);
                    }
                })();

                // Optionally, listen for channel messages.
                (async () => {
                    try {
                        for await (let data of channel) {
                            console.log(`Channel "${channelName}" message:`, data);
                            // Process the data or dispatch an event here.
                        }
                    } catch (err) {
                        console.warn(`Error in channel "${channelName}" listener:`, err);
                    }
                })();

                return channel;
            } catch (err) {
                console.warn(`Failed to subscribe to channel "${channelName}":`, err);
                return null;
            }
        },
        [socket]
    );

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

export const useSocketCluster = () => useContext(SocketClusterContext);
export default SocketClusterProvider;
