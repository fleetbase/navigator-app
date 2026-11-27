import { createContext, useContext, useEffect, useState, type Context } from 'react';
import { AppState } from 'react-native';
import { NavigationContext } from '@react-navigation/native';

/*
 * Whether a camera on this screen should be running: the screen is the one in
 * front, and the app is in the foreground. It is what vision-camera asks for
 * (`isActive={isFocused && appState === 'active'}`): a camera left running on a
 * screen underneath, in another tab or behind the lock screen holds the phone's
 * one capture session, and the next camera to open shows black.
 *
 * Read from the navigation context directly rather than through `useIsFocused`,
 * which throws without a navigator: the scanner is also used where there is
 * none (onboarding), and there it is simply "in front".
 */
const NoNavigation = createContext<undefined>(undefined);
const FocusContext = (NavigationContext ?? NoNavigation) as Context<
    { isFocused?: () => boolean; addListener?: (event: 'focus' | 'blur', listener: () => void) => () => void } | undefined
>;

const inForeground = (state: unknown) => state !== 'background' && state !== 'inactive';

export function useCameraActive(): boolean {
    const navigation = useContext(FocusContext);
    const [focused, setFocused] = useState<boolean>(() => navigation?.isFocused?.() ?? true);
    const [foreground, setForeground] = useState<boolean>(() => inForeground(AppState.currentState));

    useEffect(() => {
        if (!navigation?.addListener) {
            setFocused(true);
            return undefined;
        }
        setFocused(navigation.isFocused?.() ?? true);
        const offFocus = navigation.addListener('focus', () => setFocused(true));
        const offBlur = navigation.addListener('blur', () => setFocused(false));
        return () => {
            offFocus?.();
            offBlur?.();
        };
    }, [navigation]);

    useEffect(() => {
        setForeground(inForeground(AppState.currentState));
        const subscription = AppState.addEventListener('change', (next) => setForeground(inForeground(next)));
        return () => subscription.remove();
    }, []);

    return focused && foreground;
}

export default useCameraActive;
