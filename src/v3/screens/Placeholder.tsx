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
import { space } from '../theme/tokens';

export interface PlaceholderProps {
    title: string;
    /** Which plan phase builds this. */
    phase: string;
    /** What it is waiting on — an endpoint, a design, nothing. */
    blockedOn?: string;
}

export function Placeholder({ title, phase, blockedOn }: PlaceholderProps) {
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
        </YStack>
    );
}

/** Convenience for wiring a route without a closure per screen. */
export const placeholder = (title: string, phase: string, blockedOn?: string) => {
    const Screen = () => <Placeholder title={title} phase={phase} blockedOn={blockedOn} />;
    Screen.displayName = `Placeholder(${title})`;
    return Screen;
};

export default Placeholder;
