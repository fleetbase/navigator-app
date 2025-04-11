import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'tamagui';
import { format } from 'date-fns';
import { Order } from '@fleetbase/sdk';
import { useAuth } from './AuthContext';
import useFleetbase from '../hooks/use-fleetbase';
import useStorage from '../hooks/use-storage';
import { isArray } from '../utils';

const ChatContext = createContext(null);

export const ChatProvider: React.FC = ({ children }) => {
    const theme = useTheme();
    const { driver } = useAuth();
    const { adapter, fleetbase } = useFleetbase();
    const [channels, setChannels] = useStorage(`${driver?.id ?? 'anon'}_chat_channels`, []);
    const [currentChannel, setCurrentChannel] = useStorage(`${driver?.id ?? 'anon'}_current_channel`);
    const [isLoading, setIsLoading] = useState(false);
    const getChannelsPromiseRef = useRef(null);

    const unreadCount = useMemo(() => {
        return channels.reduce((sum, channel) => sum + (channel.unread_count || 0), 0);
    }, [channels]);

    const getChannels = useCallback(async () => {
        if (!adapter) return;

        setIsLoading(true);

        try {
            getChannelsPromiseRef.current = adapter.get('chat-channels', { sort: '-created_at' });
            const channels = await getChannelsPromiseRef.current;
            setChannels(channels);
        } catch (err) {
            console.warn('Error loading chat channels:', err);
        } finally {
            setIsLoading(false);
            getChannelsPromiseRef.current = null;
        }
    }, [adapter]);

    const deleteChannel = useCallback(
        async (channel) => {
            if (!adapter) return;

            setIsLoading(true);

            try {
                await adapter.delete(`chat-channels/${channel.id}`);
                setChannels((prevChannels) => prevChannels.filter((c) => c.id !== channel.id));
            } catch (err) {
                console.warn('Error deleting chat channel:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [adapter]
    );

    const updateChannel = useCallback(
        async (channel, data = {}) => {
            if (!adapter) return;

            setIsLoading(true);

            try {
                const updatedChatChannel = await adapter.put(`chat-channels/${channel.id}`);
                // Replace the existing channel in the array
                setChannels((prevChannels) => prevChannels.map((c) => (c.id === updatedChatChannel.id ? updatedChatChannel : c)));
                // Update current channel if id matched
                if (currentChannel && currentChannel.id === updatedChatChannel.id) {
                    setCurrentChannel(updatedChatChannel);
                }
                return updatedChatChannel;
            } catch (err) {
                console.warn('Error updating chat channel:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [adapter]
    );

    const createChannel = useCallback(
        async (data = {}) => {
            if (!adapter) return;

            setIsLoading(true);

            try {
                const newChatChannel = await adapter.post('chat-channels', data);
                setChannels((prevChannels) => [newChatChannel, ...prevChannels]);
                return newChatChannel;
            } catch (err) {
                console.warn('Error creating a new chat channel:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [adapter]
    );

    const getChannel = useCallback(
        async (id) => {
            if (!adapter) return;

            try {
                const chatChannel = await adapter.get(`chat-channels/${id}`);
                return chatChannel;
            } catch (err) {
                console.warn('Error loading chat channel:', err);
            }
        },
        [adapter]
    );

    const createChannelWithCustomer = useCallback(
        async (customer) => {
            if (!adapter) return;
            setIsLoading(true);

            const name = `${driver.name} x Customer: ${customer.name}`;

            // Check if channel already exists
            const alreadyExists = channels.some((channel) => channel.name === name);
            if (alreadyExists) {
                return;
            }

            try {
                const customerChannel = await createChannel({ name: name, participants: [customer.user, driver.getAttribute('user')] });
                return customerChannel;
            } catch (err) {
                console.warn(`Error creating a new chat channel with customer ${customer.id}:`, err);
            } finally {
                setIsLoading(false);
            }
        },
        [createChannel, addParticipant]
    );

    const reloadChannel = useCallback(
        async (channel) => {
            if (!adapter) return;

            setIsLoading(true);

            try {
                const reloadedChannel = await adapter.get(`chat-channels/${channel.id}`);
                // Replace the existing channel in the array
                setChannels((prevChannels) => prevChannels.map((c) => (c.id === reloadedChannel.id ? reloadedChannel : c)));
                // Update current channel if id matched
                if (currentChannel && currentChannel.id === reloadedChannel.id) {
                    setCurrentChannel(reloadedChannel);
                }
                return reloadedChannel;
            } catch (err) {
                console.warn(`Error reloading chat channel ${channel.id}:`, err);
            } finally {
                setIsLoading(false);
            }
        },
        [adapter]
    );

    const reloadCurrentChannel = useCallback(async () => {
        if (!adapter || !currentChannel) return;

        setIsLoading(true);

        try {
            const reloadedChannel = await adapter.get(`chat-channels/${currentChannel.id}`);
            // Replace the existing channel in the array
            setChannels((prevChannels) => prevChannels.map((c) => (c.id === reloadedChannel.id ? reloadedChannel : c)));
            // Update current channel if id matched
            setCurrentChannel(reloadedChannel);

            return reloadedChannel;
        } catch (err) {
            console.warn(`Error reloading chat channel ${currentChannel.id}:`, err);
        } finally {
            setIsLoading(false);
        }
    }, [adapter, currentChannel]);

    const sendMessage = useCallback(
        async (channel, message) => {
            if (!adapter) return;

            setIsLoading(true);
            const participant = getChannelCurrentParticipant(channel);

            try {
                const newMessage = await adapter.post(`chat-channels/${channel.id}/send-message`, { sender: participant.id, content: message });
                return newMessage;
            } catch (err) {
                console.warn('Error sending a message:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [adapter]
    );

    const createReadReceipt = useCallback(
        async (message, participant) => {
            if (!adapter) return;

            try {
                const readReceipt = await adapter.post(`chat-channels/read-message/${message.id}`, { participant: participant.id });
                return readReceipt;
            } catch (err) {
                console.warn('Error creating a read receipt:', err);
            }
        },
        [adapter]
    );

    const removeParticipant = useCallback(
        async (channel, participant) => {
            if (!adapter) return;

            setIsLoading(true);
            try {
                await adapter.delete(`chat-channels/remove-participant/${participant.id}`);
            } catch (err) {
                console.warn('Error removing participant:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [adapter]
    );

    const addParticipant = useCallback(
        async (channel, user) => {
            if (!adapter) return;

            setIsLoading(true);
            try {
                await adapter.post(`chat-channels/${channel.id}/add-participant`, { user: user.id });
            } catch (err) {
                console.warn('Error adding user as participant:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [adapter]
    );

    const getAvailableParticipants = useCallback(
        async (channel) => {
            if (!adapter) return;

            setIsLoading(true);

            try {
                const availableParticipants = await adapter.get('chat-channels/available-participants', { channel: channel?.id });
                return availableParticipants;
            } catch (err) {
                console.warn('Error fetching available participants:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [adapter]
    );

    const getChannelCurrentParticipant = (channel) => {
        return channel.participants.find((participant) => participant.user === driver.getAttribute('user'));
    };

    useEffect(() => {
        if (getChannelsPromiseRef.current) return;
        getChannels();
    }, [adapter]);

    const value = useMemo(
        () => ({
            getChannels,
            channels,
            unreadCount,
            sendMessage,
            getChannel,
            createChannel,
            updateChannel,
            deleteChannel,
            reloadChannel,
            reloadCurrentChannel,
            currentChannel,
            setCurrentChannel,
            createChannelWithCustomer,
            removeParticipant,
            addParticipant,
            getAvailableParticipants,
            isLoading,
            getChannelCurrentParticipant,
            createReadReceipt,
        }),
        [
            getChannels,
            sendMessage,
            getChannel,
            reloadChannel,
            createChannel,
            updateChannel,
            deleteChannel,
            reloadCurrentChannel,
            currentChannel,
            setCurrentChannel,
            createChannelWithCustomer,
            removeParticipant,
            addParticipant,
            getAvailableParticipants,
            channels,
            isLoading,
            createReadReceipt,
        ]
    );

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error('useChat must be used within an ChatProvider');
    }
    return context;
};
