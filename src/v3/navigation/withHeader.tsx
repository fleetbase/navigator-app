import { YStack } from 'tamagui';
import { ScreenHeader } from '../ui/ScreenHeader';
import { useTranslation } from '../i18n/useTranslation';

/**
 * Wraps a pushed screen with our own title bar and back control.
 *
 * Every route was `headerShown: false`, so a driver who tapped into a fuel
 * report, an issue, an item or the sync queue had no title telling them where
 * they were and no visible way back — only the iOS edge-swipe, which is
 * invisible and unusable with gloves on.
 *
 * The header is composed *inside* the screen rather than passed as the
 * navigator's `header` option, which was the first attempt: react-native-screens
 * hosts a custom header in its own native subtree, outside the Tamagui
 * provider, and every themed component in it threw "No theme and no parent?".
 * A wrapper keeps the header in the same tree as the screen it belongs to, and
 * the shell's own header stays where it is, above the navigator.
 *
 * Wraps the screen *slot*, so a screen override keeps the header and back
 * control without drawing its own.
 */
export function withHeader<P extends object>(titleKey: string, Screen: React.ComponentType<P>) {
    function Headered(props: P & { navigation?: { goBack: () => void; canGoBack?: () => boolean } }) {
        const { t } = useTranslation();
        const nav = props.navigation;
        const canGoBack = nav?.canGoBack ? nav.canGoBack() : Boolean(nav);
        return (
            <YStack flex={1} backgroundColor="$background">
                <ScreenHeader title={t(titleKey)} onBack={canGoBack && nav ? () => nav.goBack() : undefined} />
                <Screen {...(props as P)} />
            </YStack>
        );
    }
    Headered.displayName = `withHeader(${titleKey})`;
    return Headered;
}
