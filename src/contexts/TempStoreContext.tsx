import React, { createContext, useContext, useReducer } from 'react';

// Define actions for clarity
const SET_VALUE = 'SET_VALUE';
const REMOVE_VALUE = 'REMOVE_VALUE';

// Reducer to manage our key-value store
const storeReducer = (state, action) => {
    switch (action.type) {
        case SET_VALUE:
            return { ...state, [action.key]: action.value };
        case REMOVE_VALUE:
            const newState = { ...state };
            delete newState[action.key];
            return newState;
        default:
            return state;
    }
};

const TempStoreContext = createContext();

export const TempStoreProvider = ({ children }) => {
    const [store, dispatch] = useReducer(storeReducer, {});

    const setValue = (key, value) => {
        dispatch({ type: SET_VALUE, key, value });
    };

    const removeValue = (key) => {
        dispatch({ type: REMOVE_VALUE, key });
    };

    return <TempStoreContext.Provider value={{ store, setValue, removeValue }}>{children}</TempStoreContext.Provider>;
};

// Custom hook for accessing the store
export const useTempStore = () => useContext(TempStoreContext);
