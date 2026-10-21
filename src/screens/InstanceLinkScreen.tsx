import React, { useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, Alert } from 'react-native';
import { YStack, Text, Input, Switch, Button } from 'tamagui';
import { useConfig } from '../contexts/ConfigContext';
import { useLanguage } from '../contexts/LanguageContext';
import { toBoolean } from '../utils';
import useAppTheme from '../hooks/use-app-theme';

const InstanceLinkScreen = () => {
    const navigation = useNavigation();
    const { t } = useLanguage();
    const insets = useSafeAreaInsets();
    const { isDarkMode } = useAppTheme();
    const { instanceLinkConfig, setInstanceLinkConfig, clearInstanceLinkConfig } = useConfig();
    const [fleetbaseHost, setFleetbaseHost] = useState(instanceLinkConfig.FLEETBASE_HOST);
    const [fleetbaseKey, setFleetbaseKey] = useState(instanceLinkConfig.FLEETBASE_KEY);
    const [socketClusterHost, setSocketClusterHost] = useState(instanceLinkConfig.SOCKETCLUSTER_HOST);
    const [socketClusterPort, setSocketClusterPort] = useState(instanceLinkConfig.SOCKETCLUSTER_PORT);
    const [socketClusterSecure, setSocketClusterSecure] = useState(toBoolean(instanceLinkConfig.SOCKETCLUSTER_SECURE));

    const handleSave = useCallback(() => {
        setInstanceLinkConfig('FLEETBASE_HOST', fleetbaseHost);
        setInstanceLinkConfig('FLEETBASE_KEY', fleetbaseKey);
        setInstanceLinkConfig('SOCKETCLUSTER_HOST', socketClusterHost);
        setInstanceLinkConfig('SOCKETCLUSTER_PORT', socketClusterPort);
        setInstanceLinkConfig('SOCKETCLUSTER_SECURE', socketClusterSecure);

        Alert.alert(t('InstanceLinkScreen.configSaved'));
    }, [setInstanceLinkConfig, fleetbaseHost, fleetbaseKey, socketClusterHost, socketClusterPort, socketClusterSecure]);

    const handleReset = useCallback(() => {
        clearInstanceLinkConfig();
        setFleetbaseHost(null);
        setFleetbaseKey(null);
        setSocketClusterHost(null);
        setSocketClusterPort(null);
        setSocketClusterSecure(null);
        Alert.alert(t('InstanceLinkScreen.configReset'));
    }, [clearInstanceLinkConfig, setFleetbaseHost, setFleetbaseKey, setSocketClusterHost, setSocketClusterPort, setSocketClusterSecure]);

    return (
        <YStack flex={1} bg='$background' position='relative'>
            <ScrollView showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
                <YStack space='$5' px='$4' py='$4'>
                    <YStack space='$2'>
                        <Text color='$textPrimary' fontWeight='bold'>
                            {t('InstanceLinkScreen.fleetbaseHost')}
                        </Text>
                        <Input
                            value={fleetbaseHost}
                            onChangeText={(text) => setFleetbaseHost(text)}
                            placeholder={t('InstanceLinkScreen.fleetbaseHostPlaceholder')}
                            borderWidth={1}
                            color='$textPrimary'
                            borderColor='$borderColor'
                            borderRadius='$5'
                            bg='$surface'
                            autoCapitalize={false}
                            autoComplete='off'
                            autoCorrect={false}
                            placeholderTextColor={isDarkMode ? '$gray-700' : '$gray-400'}
                        />
                    </YStack>
                    <YStack space='$2'>
                        <Text color='$textPrimary' fontWeight='bold'>
                            {t('InstanceLinkScreen.fleetbaseKey')}
                        </Text>
                        <Input
                            value={fleetbaseKey}
                            onChangeText={(text) => setFleetbaseKey(text)}
                            placeholder={t('InstanceLinkScreen.fleetbaseKeyPlaceholder')}
                            borderWidth={1}
                            color='$textPrimary'
                            borderColor='$borderColor'
                            borderRadius='$5'
                            bg='$surface'
                            autoCapitalize={false}
                            autoComplete='off'
                            autoCorrect={false}
                            placeholderTextColor={isDarkMode ? '$gray-700' : '$gray-400'}
                        />
                    </YStack>
                    <YStack space='$2'>
                        <Text color='$textPrimary' fontWeight='bold'>
                            {t('InstanceLinkScreen.socketClusterHost')}
                        </Text>
                        <Input
                            value={socketClusterHost}
                            onChangeText={(text) => setSocketClusterHost(text)}
                            placeholder={t('InstanceLinkScreen.socketClusterHostPlaceholder')}
                            borderWidth={1}
                            color='$textPrimary'
                            borderColor='$borderColor'
                            borderRadius='$5'
                            bg='$surface'
                            autoCapitalize={false}
                            autoComplete='off'
                            autoCorrect={false}
                            placeholderTextColor={isDarkMode ? '$gray-700' : '$gray-400'}
                        />
                    </YStack>
                    <YStack space='$2'>
                        <Text color='$textPrimary' fontWeight='bold'>
                            {t('InstanceLinkScreen.socketClusterPort')}
                        </Text>
                        <Input
                            value={socketClusterPort}
                            onChangeText={(text) => setSocketClusterPort(text)}
                            placeholder={t('InstanceLinkScreen.socketClusterPortPlaceholder')}
                            keyboardType='phone-pad'
                            borderWidth={1}
                            color='$textPrimary'
                            borderColor='$borderColor'
                            borderRadius='$5'
                            bg='$surface'
                            autoCapitalize={false}
                            autoComplete='off'
                            autoCorrect={false}
                            placeholderTextColor={isDarkMode ? '$gray-700' : '$gray-400'}
                        />
                    </YStack>
                    <YStack space='$2'>
                        <Text color='$textPrimary' fontWeight='bold'>
                            {t('InstanceLinkScreen.socketClusterSecure')}
                        </Text>
                        <Switch
                            id='socketClusterSecure'
                            checked={socketClusterSecure}
                            onCheckedChange={(checked) => setSocketClusterSecure(checked)}
                            bg={socketClusterSecure ? '$green-600' : '$gray-500'}
                            borderWidth={1}
                            borderColor={isDarkMode ? '$gray-700' : '$gray-200'}
                            placeholderTextColor={isDarkMode ? '$gray-700' : '$gray-400'}
                        >
                            <Switch.Thumb animation='quick' />
                        </Switch>
                    </YStack>
                </YStack>
            </ScrollView>
            <YStack position='absolute' bottom={0} left={0} right={0} borderTopWidth={1} borderColor='$borderColorWithShadow' padding='$4'>
                <YStack space='$3' pb={insets.bottom}>
                    <Button onPress={handleSave} size='$5' bg='$info' borderColor='$infoBorder' borderWidth={1} flex={1}>
                        <Button.Text color='$infoText' fontWeight='bold' fontSize='$5'>
                            {t('InstanceLinkScreen.saveChanges')}
                        </Button.Text>
                    </Button>
                    <Button onPress={handleReset} size='$5' bg='$default' borderColor='$defaultBorder' borderWidth={1} flex={1}>
                        <Button.Text color='$defaultText' fontWeight='bold' fontSize='$5'>
                            {t('InstanceLinkScreen.reset')}
                        </Button.Text>
                    </Button>
                </YStack>
            </YStack>
        </YStack>
    );
};

export default InstanceLinkScreen;
