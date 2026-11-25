/**
 * Help and support — gap spec H3.
 *
 * The spec asks for three things: FAQ, contact dispatch, and report a bug with
 * logs attached. Two of them the app can do honestly today; the third it
 * cannot, and says so rather than shipping an empty shell.
 *
 * **Contact dispatch** is the Inbox. There is no separate support channel in
 * FleetOps, and inventing one would put driver questions somewhere nobody
 * reads — so this hands off to starting a conversation, which is the thing that
 * actually reaches a person.
 *
 * **Report a problem** files an `issue` under the organisation's own taxonomy
 * (`Software Technical` → `Bugs`), so it lands in the same queue as every other
 * defect a driver reports, is visible in the console, and queues offline like
 * anything else. It carries diagnostics, and those diagnostics are on screen
 * before the driver sends them — a button that quietly attaches things is a
 * button that attaches whatever a later version decides to.
 *
 * **FAQ** is not built, and is no longer mentioned on the screen either. There
 * is no endpoint serving help content and no agreed copy; hardcoding a few
 * questions here would be inventing product.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { YStack } from 'tamagui';
import { Body, Secondary } from '../ui/Text';
import { Banner } from '../ui/Banner';
import { Field } from '../ui/Field';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { BigButton } from '../onboarding/AuthScaffold';
import { Card, CARD_PAD, Chevron, Icon, Screen, Section, SectionLabel } from './me/parts';
import { useSync } from '../shell';
import { useQueue, useFleetbase } from '../api';
import { useCreateIssue } from '../data';
import { describeDiagnostics, type Diagnostics } from '../data/diagnostics';

/**
 * The one type and category in the console's taxonomy that mean "the app is
 * broken", spelled as the console spells them (see `me/issueTaxonomy.ts`).
 */
const APP_BUG_TYPE = 'software-technical';
const APP_BUG_CATEGORY = 'bugs';

export function HelpScreen({
    driverId,
    appVersion,
    host,
    onMessageDispatch,
}: {
    driverId?: string;
    appVersion: string;
    host?: string;
    onMessageDispatch?: () => void;
    /** Kept for callers; the title bar's back control is the way out now. */
    onDone?: () => void;
}) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const { queue } = useFleetbase();
    const { pendingCount, failedCount } = useQueue(queue);
    const { create, isSaving, queued, error } = useCreateIssue(driverId);

    const [report, setReport] = useState('');
    const [sent, setSent] = useState(false);

    const diagnostics: Diagnostics = useMemo(
        () => ({
            appVersion,
            platform: `${Platform.OS} ${String(Platform.Version)}`,
            host,
            driverId,
            queued: pendingCount,
            failed: failedCount,
            online: isOnline,
        }),
        [appVersion, host, driverId, pendingCount, failedCount, isOnline]
    );

    const summary = useMemo(() => describeDiagnostics(diagnostics), [diagnostics]);

    const submit = useCallback(async () => {
        const written = report.trim();
        if (!written) return;
        /*
         * The diagnostics go in the report body rather than a metadata field,
         * because the public issues API has nowhere else to put them — and a
         * body is what a person reading the console will actually see.
         */
        const created = await create({
            report: `${written}\n\n---\n${summary}`,
            type: APP_BUG_TYPE,
            category: APP_BUG_CATEGORY,
            priority: 'low',
            // Issues require a location; the app has none to give here and must
            // not invent one, so this is the same null island the API treats as
            // "no fix" elsewhere.
            location: { type: 'Point', coordinates: [0, 0] },
        });
        if (created) {
            setReport('');
            setSent(true);
        }
        /*
         * A queued send returns null, same as a failure — the hook tells them
         * apart through its own state, which is current in the render but stale
         * in this closure. So the banners read that state directly, and the
         * effect below clears the field once the work is safely on the device.
         */
    }, [create, report, summary]);

    useEffect(() => {
        if (queued) setReport('');
    }, [queued]);

    return (
        <Screen
            testID="help-screen"
            footer={
                <BigButton disabled={!report.trim() || isSaving} loading={isSaving} onPress={submit} testID="help-send">
                    {t('help.send')}
                </BigButton>
            }
        >
            {onMessageDispatch ? (
                <Card flush testID="help-contact">
                    <YStack
                        flexDirection="row"
                        alignItems="center"
                        gap={space[3]}
                        minHeight={68}
                        paddingHorizontal={CARD_PAD}
                        paddingVertical={space[2]}
                        onPress={onMessageDispatch}
                        pressStyle={{ backgroundColor: '$surfaceRaised' }}
                        accessibilityRole="button"
                        testID="help-message-dispatch"
                    >
                        <Icon name="help" />
                        <YStack flex={1} gap={2}>
                            <Body fontSize={16} fontWeight="800">
                                {t('help.messageDispatch')}
                            </Body>
                            <Secondary fontSize={13}>{t('help.messageDispatchBody')}</Secondary>
                        </YStack>
                        <Chevron />
                    </YStack>
                </Card>
            ) : null}

            <Section title={t('help.reportTitle')}>
                <Field label={t('help.reportLabel')} value={report} onChangeText={setReport} multiline placeholder={t('help.reportPlaceholder')} testID="help-report" />

                {/* On screen before it is sent: a button that quietly attaches things attaches whatever a later version decides to. */}
                <Card gap={space[1]} testID="help-diagnostics">
                    <SectionLabel>{t('help.diagnostics')}</SectionLabel>
                    <Body fontFamily="$mono" fontSize={13} lineHeight={19} fontWeight="500" tone="secondary" selectable testID="help-diagnostics-summary">
                        {summary}
                    </Body>
                </Card>
                <Secondary fontSize={13}>{t('help.diagnosticsNote')}</Secondary>

                {error ? (
                    <Banner tone="danger" message={t('help.reportFailed')} testID="help-error" />
                ) : queued ? (
                    <Banner tone="neutral" message={t('help.reportQueued')} testID="help-queued" />
                ) : sent ? (
                    <Banner tone="success" message={t('help.reportSent')} testID="help-sent" />
                ) : null}
            </Section>
        </Screen>
    );
}

export default HelpScreen;
