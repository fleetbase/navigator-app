import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faBolt } from '@fortawesome/free-solid-svg-icons';
import { Button, useTheme } from 'tamagui';

const HeaderButton = ({ icon, size = 35, onPress, bg = '$secondary', iconColor = '$textPrimary', borderWidth = 0, borderColor = '$borderColor', ...props }) => {
    const theme = useTheme();

    const handlePress = function () {
        if (typeof onPress === 'function') {
            onPress();
        }
    };

    return (
        <Button onPress={handlePress} justifyContent='center' alignItems='center' bg={bg} borderWidth={borderWidth} borderColor={borderColor} circular size={size} {...props}>
            <Button.Icon>
                <FontAwesomeIcon icon={icon ? icon : faBolt} color={theme[iconColor].val} />
            </Button.Icon>
        </Button>
    );
};

export default HeaderButton;
