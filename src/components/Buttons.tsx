import React from 'react';
import { Button } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faFacebook, faInstagram, faGoogle, faApple } from '@fortawesome/free-brands-svg-icons';
import { faPhone } from '@fortawesome/free-solid-svg-icons';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from 'tamagui';

export const PhoneLoginButton = ({ onPress, ...props }) => {
    const theme = useTheme();

    return (
        <Button onPress={onPress} bg='$subsurface' borderWidth={1} borderColor='$borderColor' width='100%' {...props} rounded>
            <Button.Icon>
                <FontAwesomeIcon icon={faPhone} color={theme['$textPrimary'].val} />
            </Button.Icon>
            <Button.Text color='$textPrimary'>Continue with Phone</Button.Text>
        </Button>
    );
};

export const AppleLoginButton = ({ onPress, ...props }) => {
    const theme = useTheme();
    return (
        <Button onPress={onPress} bg='$white' borderWidth={1} borderColor='$gray-200' {...props} rounded>
            <Button.Icon>
                <FontAwesomeIcon icon={faApple} color={theme['$gray-900'].val} />
            </Button.Icon>
        </Button>
    );
};

export const FacebookLoginButton = ({ onPress, ...props }) => {
    const theme = useTheme();
    return (
        <Button onPress={onPress} bg='$blue-600' borderWidth={1} borderColor='$blue-800' {...props} rounded>
            <Button.Icon>
                <FontAwesomeIcon icon={faFacebook} color={theme['$blue-100'].val} />
            </Button.Icon>
        </Button>
    );
};

export const InstagramLoginButton = ({ onPress, style = {}, ...props }) => {
    const theme = useTheme();
    return (
        <LinearGradient
            colors={['#feda75', '#fa7e1e', '#d62976', '#962fbf', '#4f5bd5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[style, { width: '100%', borderRadius: 8 }]}
            {...props}
        >
            <Button onPress={onPress} bg='transparent' width='100%' rounded>
                <Button.Icon>
                    <FontAwesomeIcon icon={faInstagram} color={theme['$white'].val} />
                </Button.Icon>
            </Button>
        </LinearGradient>
    );
};

export const GoogleLoginButton = ({ onPress, ...props }) => (
    <Button onPress={onPress} bg='#4285F4' {...props} rounded>
        <Button.Icon>
            <FontAwesomeIcon icon={faGoogle} color='white' />
        </Button.Icon>
    </Button>
);
