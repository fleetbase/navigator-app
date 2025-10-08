import { faCheck, faCompass, faMapLocation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { FlatList, TouchableOpacity } from 'react-native';
import { Sheet, Text, XStack, YStack } from 'tamagui';
import useAppTheme from '../hooks/use-app-theme';

interface NavigationApp {
    name: string;
    key: string;
}

interface NavigationAppSelectorProps {
    onSelect: (appKey: string, index: number) => void;
}

export interface NavigationAppSelectorRef {
    open: (apps: NavigationApp[]) => void;
    close: () => void;
}

const NavigationAppSelector = forwardRef<NavigationAppSelectorRef, NavigationAppSelectorProps>(({ onSelect }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const [apps, setApps] = useState<NavigationApp[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const { isDarkMode } = useAppTheme();

    useImperativeHandle(ref, () => ({
        open: (navigationApps: NavigationApp[]) => {
            setApps(navigationApps);
            setIsOpen(true);
            setSelectedIndex(null);
        },
        close: () => {
            setIsOpen(false);
            setSelectedIndex(null);
        },
    }));

    const handleSelect = (index: number) => {
        setSelectedIndex(index);
        const appKey = apps[index].key;
        onSelect(appKey, index);
        setTimeout(() => {
            setIsOpen(false);
            setSelectedIndex(null);
        }, 200);
    };

    const handleCancel = () => {
        setIsOpen(false);
        setSelectedIndex(null);
    };

    return (
        <Sheet
            modal
            open={isOpen}
            onOpenChange={setIsOpen}
            snapPoints={[50]}
            dismissOnSnapToBottom
            zIndex={100000}
            animation="medium"
        >
            <Sheet.Overlay animation="lazy" enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} backgroundColor="rgba(0,0,0,0.5)" />
            <Sheet.Frame padding="$4" backgroundColor="$background">
                <Sheet.Handle backgroundColor="$borderColor" />
                <YStack space="$3" paddingTop="$4" justifyContent='space-between'>
                    <XStack alignItems="center" justifyContent="center" space="$2" marginBottom="$2">
                        <FontAwesomeIcon icon={faCompass} size={24} color={isDarkMode ? '#fff' : '#000'} />
                        <Text fontSize="$6" fontWeight="bold" color="$textPrimary" textAlign="center">
                            Select Navigation App
                        </Text>
                    </XStack>

                    <FlatList
                        data={apps}
                        keyExtractor={(item, index) => `${item.key}-${index}`}
                        renderItem={({ item, index }) => (
                            <TouchableOpacity onPress={() => handleSelect(index)} activeOpacity={0.7}>
                                <XStack
                                    padding="$4"
                                    borderRadius="$3"
                                    backgroundColor={selectedIndex === index ? '$info' : '$backgroundHover'}
                                    marginBottom="$2"
                                    alignItems="center"
                                    justifyContent="space-between"
                                    borderWidth={1}
                                    borderColor={selectedIndex === index ? '$infoBorder' : '$borderColor'}
                                >
                                    <XStack alignItems="center">
                                        <FontAwesomeIcon icon={faMapLocation} size={20} color={isDarkMode ? '#fff' : '#000'} style={{ marginRight: 10 }} />
                                        <Text
                                            fontSize="$5"
                                            color={selectedIndex === index ? '$infoText' : '$textPrimary'}
                                            fontWeight={selectedIndex === index ? '600' : '400'}
                                        >
                                            {item.name}
                                        </Text>
                                    </XStack>
                                    {selectedIndex === index && (
                                        <FontAwesomeIcon icon={faCheck} color={isDarkMode ? '#fff' : '#0284c7'} size={20} />
                                    )}
                                </XStack>
                            </TouchableOpacity>
                        )}
                        showsVerticalScrollIndicator={true}
                        style={{ height: "62%" }}
                    />

                    <TouchableOpacity onPress={handleCancel} activeOpacity={0.8}>
                        <XStack
                            padding="$4"
                            borderRadius="$3"
                            backgroundColor="$backgroundHover"
                            alignItems="center"
                            justifyContent="center"
                            marginTop="$2"
                            borderWidth={1}
                            borderColor="$borderColor"
                        >
                            <Text fontSize="$5" color="$textPrimary" fontWeight="600">
                                Cancel
                            </Text>
                        </XStack>
                    </TouchableOpacity>
                </YStack>
            </Sheet.Frame>
        </Sheet>
    );
});

NavigationAppSelector.displayName = 'NavigationAppSelector';

export default NavigationAppSelector;
