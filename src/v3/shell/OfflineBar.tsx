/**
 * The shell's connectivity strip.
 *
 * Renders nothing when online, idle and empty — the common case must cost no
 * vertical space. Offline is deliberately calm: losing signal in a basement or a
 * loading dock is expected, and alarming the driver about it is wrong. Failure
 * to sync is not calm, and gets the danger treatment plus a retry.
 */
import { Banner, OfflineBanner, SyncedBanner } from '../ui/Banner';
import { useSync } from './SyncContext';

export function OfflineBar({ testID }: { testID?: string }) {
    const { isOnline, queuedCount, syncState, lastSyncedCount, retry } = useSync();

    if (syncState === 'failed') {
        return <Banner tone="danger" message="Some work could not be synced" meta={queuedCount ? `${queuedCount} queued` : undefined} action={{ label: 'Retry', onPress: retry }} testID={testID} />;
    }

    if (!isOnline) {
        return <OfflineBanner queued={queuedCount} />;
    }

    if (syncState === 'syncing' && queuedCount > 0) {
        return <Banner tone="brand" message="Syncing your work…" meta={`${queuedCount} left`} testID={testID} />;
    }

    if (lastSyncedCount > 0) {
        return <SyncedBanner count={lastSyncedCount} />;
    }

    return null;
}

export default OfflineBar;
