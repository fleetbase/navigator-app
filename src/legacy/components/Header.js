import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, Platform } from 'react-native';
import DefaultHeader from 'components/headers/DefaultHeader';

const Header = ({ navigation, route, options }) => {
    return <DefaultHeader onSearchButtonPress={() => navigation.push('SearchScreen')} />;
};

export default Header;
