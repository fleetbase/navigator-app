import React, { useState } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import { YStack, XStack, Button, TextArea, useTheme } from 'tamagui';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCamera, faPlus, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import useAppTheme from '../hooks/use-app-theme';
import CameraCapture from './CameraCapture';

const INPUT_MIN_HEIGHT = 40;
const INPUT_MAX_HEIGHT = 120;
const ChatKeyboard = ({ onSend, onAttach, onCamera, onFocus, onBlur }) => {
    const { isDarkMode } = useAppTheme();
    const theme = useTheme();
    const headerHeight = useHeaderHeight();
    const [message, setMessage] = useState('');
    const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
    const [usingCamera, setUsingCamera] = useState(false);

    const handleSend = () => {
        if (!message.trim().length) return;

        if (typeof onSend === 'function') {
            onSend(message.trim());
        }
        setMessage('');
    };

    const handleCameraCapture = () => {
        setUsingCamera(true);
    };

    const handleAddPhotosFromCamera = () => {
        setUsingCamera(false);
    };

    if (usingCamera) {
        return (
            <YStack flex={1} position='absolute' top={0} bottom={0} left={0} right={0} bg='black' width='100%' height='100%'>
                <CameraCapture onDone={handleAddPhotosFromCamera} />
            </YStack>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
            <YStack backgroundColor='$background' px='$1' py='$3' borderTopWidth={1} borderColor='$borderColor'>
                <XStack alignItems='center'>
                    <YStack>
                        <Button unstyled py='$2' px='$2'>
                            <Button.Icon>
                                <FontAwesomeIcon icon={faPlus} size={18} color={theme['$textSecondary'].val} />
                            </Button.Icon>
                        </Button>
                    </YStack>
                    <YStack flex={1}>
                        <TextArea
                            flex={1}
                            value={message}
                            onChangeText={setMessage}
                            onContentSizeChange={(e) => {
                                const newHeight = Math.min(Math.max(INPUT_MIN_HEIGHT, e.nativeEvent.contentSize.height), INPUT_MAX_HEIGHT);
                                if (newHeight !== inputHeight) {
                                    setInputHeight(newHeight);
                                }
                            }}
                            height={inputHeight}
                            minHeight={INPUT_MIN_HEIGHT}
                            maxHeight={INPUT_MAX_HEIGHT}
                            textAlignVertical='top'
                            lineHeight={20}
                            placeholder='Type a message'
                            multiline
                            backgroundColor='$surface'
                            borderColor='$borderColor'
                            borderWidth={1}
                            borderRadius='$5'
                            px='$2'
                            py='$2'
                            fontSize={14}
                            onFocus={onFocus}
                            onBlur={onBlur}
                            placeholderTextColor={isDarkMode ? '$gray-500' : '$gray-400'}
                        />
                    </YStack>
                    <XStack px='$2' gap='$1'>
                        {message.trim() ? (
                            <Button onPress={handleSend} circular size={32} bg='$success' borderWidth={1} borderColor='$successBorder' alignItems='center' justifyContent='center'>
                                <Button.Icon>
                                    <FontAwesomeIcon icon={faPaperPlane} size={14} color={theme['$successText'].val} />
                                </Button.Icon>
                            </Button>
                        ) : (
                            <Button onPress={handleCameraCapture} unstyled py='$2' px='$2'>
                                <Button.Icon>
                                    <FontAwesomeIcon icon={faCamera} size={18} color={theme['$textSecondary'].val} />
                                </Button.Icon>
                            </Button>
                        )}
                    </XStack>
                </XStack>
            </YStack>
        </KeyboardAvoidingView>
    );
};

export default ChatKeyboard;
