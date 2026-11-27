/**
 * Navigation hand-off — R2 frame D6 — as a screen of its own.
 *
 * The order screen and Home now open the choice of app as a sheet over
 * themselves (navigate/NavigationHandoffSheet). This screen is what the
 * `NavigationHandoff` route still shows for anything that navigates to it: the
 * same content, on a page.
 */
import { ScrollView } from '../ui/Scroll';
import { space } from '../theme/tokens';
import { useScreenStyle } from '../ui/useScreenStyle';
import { NavigationHandoffContent } from '../navigate/NavigationHandoffSheet';
import type { Destination } from '../navigate/handoff';

export function NavigationHandoffScreen({
    destination,
    onDone,
    /** Injected in tests; defaults to the real Linking probe. */
    probe,
    open,
}: {
    destination?: Destination;
    onDone?: () => void;
    probe?: (url: string) => Promise<boolean>;
    open?: (url: string) => Promise<unknown>;
}) {
    const screen = useScreenStyle();
    return (
        <ScrollView style={screen} contentContainerStyle={{ flexGrow: 1, padding: space[4], justifyContent: destination ? 'flex-start' : 'center' }}>
            <NavigationHandoffContent destination={destination} onDone={onDone} probe={probe} open={open} />
        </ScrollView>
    );
}

export default NavigationHandoffScreen;
