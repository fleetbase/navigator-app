import React, { createContext, useState, useContext, useEffect, useMemo, ReactNode } from 'react';
import { navigatorConfig, config } from '../utils';
import Config from '../../navigator.config';
import Env from 'react-native-config';

const ConfigContext = createContext();

export const ConfigProvider = ({ children }: { children: ReactNode }) => {
    return <ConfigContext.Provider value={{ ...Config, ...Env, navigatorConfig, config }}>{children}</ConfigContext.Provider>;
};

export const useConfig = () => {
    return useContext(ConfigProvider);
};

export const useDefaultTabIsStoreHome = () => {
    const { navigatorConfig } = useAuth();
    return navigatorConfig('storeNavigator.defaultTab', 'StoreHomeTab') === 'StoreHomeTab';
};

export const useDefaultTabIsFoodTruck = () => {
    const { navigatorConfig } = useAuth();
    return navigatorConfig('storeNavigator.defaultTab', 'StoreHomeTab') === 'StoreFoodTruckTab';
};
