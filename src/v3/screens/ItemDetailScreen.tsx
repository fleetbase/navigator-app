/**
 * Item — one item of an order, on a screen of its own.
 *
 * The order screen no longer comes here: tapping an item there opens the item
 * pager over the order (screens/item/ItemPagerModal). This is what the
 * `EntityDetail` route still shows, for anything else that navigates to it (a
 * build's own routes, a replaced order screen): the very same card the pager
 * shows (screens/item/ItemCard), filling the screen, with the same scanner and
 * the same full-screen photo over it.
 *
 * Everything the screen always did is in the card: the fetch that fills in the
 * sparse copy from the order payload, the barcode and QR code as images (the
 * API sends bare base64), rows left out when they have no value, the damaged
 * state, and the history of the item's tracking number.
 *
 * With an order id the driver edits in place, as in the pager, and can scan the
 * item. `onEdit` still opens the full edit form, which also says why a field
 * is locked.
 */
import { useCallback, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { YStack } from 'tamagui';
import { useEditableEntityFields, useOrder, orderStops, payloadOf, type EntityRecord } from '../data';
import { useItemScans } from '../data/useItemScans';
import { ItemCard } from './item/ItemCard';
import { ItemScanner, PhotoViewer, type ScanTarget } from './item/ItemOverlays';

export function ItemDetailScreen({
    entityId,
    entity: seed,
    orderId,
    onEdit,
    openUrl = (url: string) => Linking.openURL(url),
}: {
    entityId?: string;
    /** The copy already in the order payload, so the screen paints instantly. */
    entity?: EntityRecord | null;
    /** The order the item is on: what decides which fields may be edited, and where a scan is recorded. */
    orderId?: string;
    onEdit?: (entity: { id: string; name?: string }) => void;
    /** No longer drawn: the screen's title bar is the way back. Kept so a host that still passes it type-checks. */
    onBack?: () => void;
    /** Injected in tests; defaults to Linking. */
    openUrl?: (url: string) => Promise<unknown>;
}) {
    // Without an order nothing is asked of the server and nothing is editable: locked, not open.
    const { isEditable } = useEditableEntityFields(orderId);
    const scans = useItemScans(orderId);
    // The order as the phone already holds it, for the name of the waypoint the item is going to.
    const order = useOrder(orderId);
    const stops = useMemo(() => orderStops(payloadOf(order)), [order]);

    const [scanning, setScanning] = useState<ScanTarget | null>(null);
    const [photo, setPhoto] = useState<{ uri: string; name?: string } | null>(null);

    const scanSubject = scanning?.subjectId;
    const sendScan = scans.scan;
    const onCode = useCallback((code: string) => sendScan(scanSubject as string, code), [sendScan, scanSubject]);
    const closeScanner = useCallback(() => setScanning(null), []);

    return (
        <YStack flex={1} backgroundColor="$background">
            <ItemCard
                entityId={entityId}
                seed={seed}
                stops={stops}
                isEditable={isEditable}
                scanOf={scans.scanOf}
                scansLoading={!!orderId && scans.isLoading}
                scansFailed={scans.failed}
                // A scan is recorded against an order; without one there is nowhere to send it.
                onScan={orderId ? setScanning : undefined}
                onOpenPhoto={setPhoto}
                onEdit={onEdit}
                openUrl={openUrl}
                framed={false}
            />
            {photo ? <PhotoViewer uri={photo.uri} name={photo.name} onClose={() => setPhoto(null)} /> : null}
            {scanning ? <ItemScanner item={scanning} onCode={onCode} onClose={closeScanner} /> : null}
        </YStack>
    );
}

export default ItemDetailScreen;
