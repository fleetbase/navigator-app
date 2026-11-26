/**
 * "This order is no longer yours" — one line, however many orders went.
 *
 * An order can leave a driver's list because it was given to someone else,
 * cancelled or deleted, and the app is not told which: it only sees that the
 * order is gone. So the wording says what is true in every case — it is no
 * longer assigned to you — rather than guessing "reassigned".
 *
 * Several orders leaving at once (a route rebuilt, a batch removed) make one
 * notice with a count, not a stack to dismiss one by one, and the notice clears
 * itself after a short while: it is information, not a task.
 */
import { useEffect } from 'react';
import { Banner } from '../../ui/Banner';
import { useTranslation } from '../../i18n/useTranslation';
import { orderStore, type OrderNotice } from '../../data';

/** Long enough to read on a glance at a cradle; short enough not to linger. */
const CLEAR_AFTER_MS = 8000;

export function OrderNotices({ notices, testID = 'order-notices' }: { notices: OrderNotice[]; testID?: string }) {
    const { t } = useTranslation();
    const count = notices.length;
    // Restarted whenever another order goes, so the newest is on screen for the full time.
    const newest = count ? notices[count - 1].at : 0;

    useEffect(() => {
        if (!count) return;
        const timer = setTimeout(() => orderStore.dismissAllNotices(), CLEAR_AFTER_MS);
        return () => clearTimeout(timer);
    }, [count, newest]);

    if (!count) return null;

    return (
        <Banner
            tone="neutral"
            message={count === 1 ? t('ordersScreen.unassigned', { order: notices[0].label }) : t('ordersScreen.unassignedMany', { count })}
            action={{ label: t('common.dismiss'), onPress: () => orderStore.dismissAllNotices() }}
            testID={testID}
        />
    );
}

export default OrderNotices;
