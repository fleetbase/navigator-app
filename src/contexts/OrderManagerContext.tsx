import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Order } from '@fleetbase/sdk';
import { useAuth } from './AuthContext';
import useFleetbase from '../hooks/use-fleetbase';
import useStorage from '../hooks/use-storage';

function serializeCollection(collection) {
    return collection.map((resource) => resource.serialize());
}

function restoreCollection(collection, adapter) {
    return collection.map((json) => new Order(json, adapter));
}

const OrderManagerContext = createContext(null);

export const OrderManagerProvider: React.FC = ({ children }) => {
    const { driver } = useAuth();
    const { fleetbase, adapter } = useFleetbase();
    const today = format(new Date(), 'yyyy-MM-dd');

    // Current date is stored in provider state with default value of today.
    const [currentDate, setCurrentDate] = useState(today);

    // Local storage for caching orders
    const [allRecentOrders, setAllRecentOrders] = useStorage(`${driver?.id}_all_recent_orders`, []);
    const [allActiveOrders, setAllActiveOrders] = useStorage(`${driver?.id}_all_active_orders`, []);
    // Use currentDate state to build the storage key for current orders.
    const [currentOrders, setCurrentOrders] = useStorage(`${driver?.id}_${currentDate.replaceAll('-', '')}_orders`, []);
    const [ordersToday, setOrdersToday] = useStorage(`${driver?.id}_${today.replaceAll('-', '')}_orders`, []);

    const [isFetchingActiveOrders, setIsFetchingActiveOrders] = useState(false);
    const [isFetchingRecentOrders, setIsFetchingRecentOrders] = useState(false);
    const [isFetchingCurrentOrders, setIsFetchingCurrentOrders] = useState(false);

    // Define statuses to exclude from active orders
    const nonActiveOrderStatuses = useMemo(() => new Set(['completed', 'created', 'canceled', 'order_canceled']), []);

    // Derive active orders from all recent orders
    const recentActiveOrders = useMemo(() => {
        return allRecentOrders.filter((order) => !nonActiveOrderStatuses.has(order.status));
    }, [allRecentOrders, nonActiveOrderStatuses]);

    // Generic function to query orders from Fleetbase API
    const queryOrders = useCallback(
        async (params = {}, setIsFetching) => {
            if (!fleetbase) return;
            if (setIsFetching) setIsFetching(true);
            params.with_tracker_data = true;
            try {
                const orders = await fleetbase.orders.query(params);
                return orders;
            } catch (error) {
                console.error('Error fetching orders:', error);
                throw error;
            } finally {
                if (setIsFetching) setIsFetching(false);
            }
        },
        [fleetbase]
    );

    // Refs to ensure orders are loaded only once per driver session
    const hasLoadedActiveRef = useRef(false);
    const hasLoadedRecentRef = useRef(false);
    const hasLoadedCurrentRef = useRef(false);

    // Refs to hold in-flight promises to guard against duplicate requests
    const activeOrdersPromiseRef = useRef<Promise<any> | null>(null);
    const recentOrdersPromiseRef = useRef<Promise<any> | null>(null);
    const currentOrdersPromiseRef = useRef<Promise<any> | null>(null);

    // Fetch active orders
    const fetchActiveOrders = useCallback(
        async (params = {}) => {
            if (!driver || !fleetbase || hasLoadedActiveRef.current || activeOrdersPromiseRef.current) return;
            try {
                activeOrdersPromiseRef.current = queryOrders({ driver_assigned: driver.id, active: true, limit: -1, ...params }, setIsFetchingActiveOrders);
                const fetchedOrders = await activeOrdersPromiseRef.current;
                setAllActiveOrders(serializeCollection(fetchedOrders));
                hasLoadedActiveRef.current = true;
            } catch (error) {
                console.error('Unable to load active orders for driver:', error);
                setAllActiveOrders([]);
            } finally {
                activeOrdersPromiseRef.current = null;
            }
        },
        [fleetbase, driver, queryOrders, setAllActiveOrders]
    );

    // Fetch recent orders
    const fetchRecentOrders = useCallback(
        async (params = {}) => {
            if (!driver || !fleetbase || hasLoadedRecentRef.current || recentOrdersPromiseRef.current) return;
            try {
                recentOrdersPromiseRef.current = queryOrders({ driver_assigned: driver.id, limit: 30, ...params }, setIsFetchingRecentOrders);
                const fetchedOrders = await recentOrdersPromiseRef.current;
                setAllRecentOrders(serializeCollection(fetchedOrders));
                hasLoadedRecentRef.current = true;
            } catch (error) {
                console.error('Unable to load recent orders for driver:', error);
                setAllRecentOrders([]);
            } finally {
                recentOrdersPromiseRef.current = null;
            }
        },
        [fleetbase, driver, queryOrders, setAllRecentOrders]
    );

    // Fetch current orders for the currentDate.
    const fetchCurrentOrders = useCallback(
        async (params = {}) => {
            if (!driver || !fleetbase || !currentDate || hasLoadedCurrentRef.current || currentOrdersPromiseRef.current) return;
            try {
                // We assume the API accepts a `date` parameter.
                currentOrdersPromiseRef.current = queryOrders({ driver_assigned: driver.id, on: currentDate, limit: -1, ...params }, setIsFetchingCurrentOrders);
                const fetchedOrders = await currentOrdersPromiseRef.current;
                setCurrentOrders(serializeCollection(fetchedOrders));
                hasLoadedCurrentRef.current = true;
            } catch (error) {
                console.error('Unable to load current orders for driver:', error);
                setCurrentOrders([]);
            } finally {
                currentOrdersPromiseRef.current = null;
            }
        },
        [fleetbase, driver, currentDate, queryOrders, setCurrentOrders]
    );

    // Trigger active and recent order fetches when driver and fleetbase are available.
    useEffect(() => {
        if (driver && fleetbase) {
            fetchActiveOrders();
            fetchRecentOrders();
        }
    }, [driver, fleetbase, fetchActiveOrders, fetchRecentOrders]);

    // Whenever the currentDate state changes, reset and fetch current orders.
    useEffect(() => {
        if (driver && fleetbase && currentDate) {
            hasLoadedCurrentRef.current = false;
            currentOrdersPromiseRef.current = null;
            fetchCurrentOrders();
        }
    }, [driver, fleetbase, currentDate, fetchCurrentOrders]);

    // Manual reload functions.
    const reloadOrders = useCallback(
        (params = {}) => {
            hasLoadedActiveRef.current = false;
            hasLoadedRecentRef.current = false;
            activeOrdersPromiseRef.current = null;
            recentOrdersPromiseRef.current = null;
            fetchActiveOrders(params);
            fetchRecentOrders(params);
        },
        [fetchActiveOrders, fetchRecentOrders]
    );

    const reloadRecentOrders = useCallback(
        (params = {}) => {
            hasLoadedRecentRef.current = false;
            recentOrdersPromiseRef.current = null;
            fetchRecentOrders(params);
        },
        [fetchRecentOrders]
    );

    const reloadActiveOrders = useCallback(
        (params = {}) => {
            hasLoadedActiveRef.current = false;
            activeOrdersPromiseRef.current = null;
            fetchActiveOrders(params);
        },
        [fetchActiveOrders]
    );

    const reloadCurrentOrders = useCallback(
        (params = {}) => {
            hasLoadedCurrentRef.current = false;
            currentOrdersPromiseRef.current = null;
            fetchCurrentOrders(params);
        },
        [fetchCurrentOrders]
    );

    const value = useMemo(
        () => ({
            queryOrders,
            currentDate,
            setCurrentDate,
            allRecentOrders: restoreCollection(allRecentOrders, adapter),
            recentActiveOrders: restoreCollection(recentActiveOrders, adapter),
            allActiveOrders: restoreCollection(allActiveOrders, adapter),
            ordersToday: restoreCollection(ordersToday, adapter),
            currentOrders: restoreCollection(currentOrders, adapter),
            reloadOrders,
            reloadRecentOrders,
            reloadActiveOrders,
            reloadCurrentOrders,
            isFetchingActiveOrders,
            isFetchingRecentOrders,
            isFetchingCurrentOrders,
        }),
        [
            queryOrders,
            currentDate,
            allRecentOrders,
            recentActiveOrders,
            allActiveOrders,
            ordersToday,
            currentOrders,
            adapter,
            reloadOrders,
            isFetchingActiveOrders,
            isFetchingRecentOrders,
            isFetchingCurrentOrders,
        ]
    );

    return <OrderManagerContext.Provider value={value}>{children}</OrderManagerContext.Provider>;
};

export const useOrderManager = () => {
    const context = useContext(OrderManagerContext);
    if (!context) {
        throw new Error('useOrderManager must be used within an OrderManagerProvider');
    }
    return context;
};
