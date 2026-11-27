import { useCallback, useMemo, useState } from 'react';
import { useHandoffDestination } from '../navigation/session';
import { NavigationHandoffSheet } from './NavigationHandoffSheet';
import type { Destination } from './handoff';

/**
 * The choice of navigation app, as a sheet over the screen that asked for it
 * (Home, the order). `open` shows it; `sheet` is rendered beside the screen.
 *
 * With an order id the destination is read from the order as it is now, as the
 * `NavigationHandoff` route does: a drop-off moved while the sheet is open is
 * the one the driver is sent to.
 */
export function useNavigationHandoffSheet(): { open: (destination?: Destination, orderId?: string) => void; sheet: React.ReactElement } {
    const [request, setRequest] = useState<{ destination?: Destination; orderId?: string } | null>(null);
    const [visible, setVisible] = useState(false);
    const destination = useHandoffDestination(request?.orderId, request?.destination);
    const open = useCallback((point?: Destination, orderId?: string) => {
        setRequest({ destination: point, orderId });
        setVisible(true);
    }, []);
    const close = useCallback(() => setVisible(false), []);
    const sheet = useMemo(() => <NavigationHandoffSheet visible={visible} destination={destination} onClose={close} />, [visible, destination, close]);
    return { open, sheet };
}

export default useNavigationHandoffSheet;
