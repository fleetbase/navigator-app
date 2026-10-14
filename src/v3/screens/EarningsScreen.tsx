/**
 * Earnings — R2 frame H2, which is a heading with no frame behind it (the
 * canvas was truncated there). Specified from the gap spec's own words:
 * balance, a period selector, a transaction feed with type and direction,
 * and payout status. Config-gated, off by default — the route renders the
 * not-enabled state until the organisation switches it on, so the app never
 * shows a plausible-looking zero that is really "not wired up" (correction 5).
 *
 * Money arrives in minor units and is formatted once, here, with the wallet's
 * currency. Direction is shown with a glyph and a tone, never colour alone.
 */
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, HeroValue, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Banner, EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { Segmented } from '../ui/Field';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useWallet, signedAmount, type WalletPeriod, type WalletTransaction } from '../data';
import { formatDateTime, formatMoney } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';

export interface EarningsScreenProps {
    reloadToken?: number;
}

function TransactionRow({ tx, currency, t }: { tx: WalletTransaction; currency: string; t: (k: string, o?: Record<string, unknown>) => string }) {
    const amount = signedAmount(tx);
    const credit = amount >= 0;
    const label = t(`earnings.type.${String(tx.type ?? 'other')}`, { defaultValue: String(tx.type ?? t('earnings.type.other')) });
    return (
        <XStack padding={space[3]} gap={space[3]} alignItems="center" testID={`earnings-tx-${tx.id}`}>
            <Micro fontSize={18} tone={credit ? 'success' : 'danger'} width={22} textAlign="center">
                {credit ? '↑' : '↓'}
            </Micro>
            <YStack flex={1} gap={2} minWidth={0}>
                <Body fontSize={15} fontWeight="700" numberOfLines={1}>
                    {label}
                </Body>
                {tx.description ? <Secondary fontSize={13} numberOfLines={2}>{tx.description}</Secondary> : null}
                <Micro tabular>{formatDateTime(tx.created_at)}</Micro>
                {tx.gateway_transaction_id ? <Identifier value={tx.gateway_transaction_id} boxed={false} /> : null}
            </YStack>
            <YStack alignItems="flex-end" gap={2}>
                <Body fontSize={15} fontWeight="800" tabular tone={credit ? 'success' : 'primary'}>
                    {credit ? '+' : '−'}
                    {formatMoney(Math.abs(amount), tx.currency ?? currency)}
                </Body>
                {tx.status ? <StatusPill status={tx.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} /> : null}
            </YStack>
        </XStack>
    );
}

export function EarningsScreen({ reloadToken = 0 }: EarningsScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const [period, setPeriod] = useState<WalletPeriod>('month');
    const { balance, transactions, periodTotal, isLoading, isRefreshing, failed, error, refresh, retry } = useWallet(true, period, reloadToken);

    const periods = useMemo(
        () => [
            { value: 'week' as const, label: t('earnings.periodWeek') },
            { value: 'month' as const, label: t('earnings.periodMonth') },
            { value: 'all' as const, label: t('earnings.periodAll') },
        ],
        [t]
    );

    if (isLoading && !balance) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="earnings-loading">
                <Skeleton height={140} />
                <Skeleton height={200} />
            </YStack>
        );
    }

    if (failed && !balance) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center">
                <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="earnings-error" />
            </YStack>
        );
    }

    const currency = balance?.currency ?? 'USD';
    const frozen = String(balance?.status ?? '').toLowerCase() === 'frozen';

    return (
        <ScrollView
            style={screen}
            contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: space[7] }}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
            testID="earnings-screen"
        >
            <Surface hero padded testID="earnings-balance">
                <YStack gap={space[2]}>
                    <XStack justifyContent="space-between" alignItems="center">
                        <Caption>{t('earnings.balance')}</Caption>
                        {balance?.status ? <StatusPill status={balance.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} testID="earnings-wallet-status" /> : null}
                    </XStack>
                    <HeroValue fontSize={40} testID="earnings-balance-value">
                        {formatMoney(balance?.balance ?? 0, currency)}
                    </HeroValue>
                    <Micro>{t('earnings.payoutNote')}</Micro>
                </YStack>
            </Surface>

            {frozen ? <Banner tone="warning" message={t('earnings.frozen')} testID="earnings-frozen" /> : null}

            <YStack gap={space[2]}>
                <Segmented options={periods} value={period} onChange={setPeriod} testID="earnings-period" />
                <XStack justifyContent="space-between" alignItems="baseline" paddingHorizontal={space[1]}>
                    <Caption>{t('earnings.periodTotal')}</Caption>
                    <Body fontSize={15} fontWeight="800" tabular tone={periodTotal >= 0 ? 'success' : 'danger'} testID="earnings-period-total">
                        {periodTotal >= 0 ? '+' : '−'}
                        {formatMoney(Math.abs(periodTotal), currency)}
                    </Body>
                </XStack>
            </YStack>

            {transactions.length ? (
                <Surface testID="earnings-feed">
                    {transactions.map((tx, i) => (
                        <YStack key={tx.id}>
                            {i > 0 ? <Divider /> : null}
                            <TransactionRow tx={tx} currency={currency} t={t} />
                        </YStack>
                    ))}
                </Surface>
            ) : (
                <EmptyState title={t('earnings.emptyTitle')} body={t('earnings.emptyBody')} testID="earnings-empty" />
            )}
        </ScrollView>
    );
}

export default EarningsScreen;
