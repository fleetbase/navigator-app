/**
 * Placeholder for routes whose screens land in a later phase.
 *
 * Deliberately one shared component rather than a stub file per screen: v2
 * shipped VehicleScreen, FleetScreen, DriverFleetScreen and TestScreen, each
 * rendering nothing but its own name, and they survived for years because
 * nothing said what they were waiting for. This states the phase and the
 * blocker, so an unfinished route reads as planned rather than broken.
 *
 * Every usage should disappear by the end of Phase 4b.
 */
import { YStack } from 'tamagui';
import { Body, Heading, Micro, Secondary } from '../ui/Text';
import { Button } from '../ui/Button';
import { space } from '../theme/tokens';

export interface PlaceholderProps {
    title: string;
    /** Which plan phase builds this. */
    phase: string;
    /** What it is waiting on — an endpoint, a design, nothing. */
    blockedOn?: string;
    /**
     * Routes below this one that *are* built.
     *
     * An unbuilt hub otherwise strands its finished children: Fuel log lives
     * under Account, and Account is a placeholder, so nothing could reach it.
     * Since the point of this screen is that the shell stays navigable, it
     * carries the links until the real screen replaces it.
     */
    links?: { route: string; label: string }[];
    onNavigate?: (route: string) => void;
}

export function Placeholder({ title, phase, blockedOn, links, onNavigate }: PlaceholderProps) {
    return (
        <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center" padding={space[5]} gap={space[2]}>
            <Heading center>{title}</Heading>
            <Secondary center>Built in {phase}.</Secondary>
            {blockedOn ? (
                <Micro center tone="warning">
                    Blocked on: {blockedOn}
                </Micro>
            ) : null}
            <Body marginTop={space[4]} tone="muted" fontSize={13} center>
                This route exists so the shell can be navigated and verified.
            </Body>

            {links?.length && onNavigate ? (
                <YStack gap={space[2]} alignSelf="stretch" marginTop={space[4]}>
                    {links.map((link) => (
                        <Button key={link.route} variant="secondary" fullWidth onPress={() => onNavigate(link.route)} testID={`link-${link.route}`}>
                            {link.label}
                        </Button>
                    ))}
                </YStack>
            ) : null}
        </YStack>
    );
}

/** Convenience for wiring a route without a closure per screen. */
export const placeholder = (title: string, phase: string, blockedOn?: string, links?: { route: string; label: string }[]) => {
    const Screen = ({ navigation }: { navigation?: { navigate: (route: string, params?: object) => void } }) => (
        <Placeholder
            title={title}
            phase={phase}
            blockedOn={blockedOn}
            links={links}
            onNavigate={navigation ? (route) => navigation.navigate(route) : undefined}
        />
    );
    Screen.displayName = `Placeholder(${title})`;
    return Screen;
};

export default Placeholder;
