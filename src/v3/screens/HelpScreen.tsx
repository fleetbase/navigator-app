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
 * **FAQ** is not built. There is no endpoint serving help content and no
 * agreed copy; hardcoding a few questions here would be inventing product.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Platform } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Banner';
import { Field } from '../ui/Field';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useScreenStyle } from '../ui/useScreenStyle';
import { chevron } from '../i18n/direction';
import { useSync } from '../shell';
import { useQueue, useFleetbase } from '../api';
import { useCreateIssue } from '../data';
import { describeDiagnostics, type Diagnostics } from '../data/diagnostics';
import { IssueType } from '../../constants/Enums';

/** The one category in the org taxonomy that means "the app is broken". */
const APP_BUG_CATEGORY = 'Bugs';

export function HelpScreen({
    driverId,
    appVersion,
    host,
    onMessageDispatch,
    onDone,
}: {
    driverId?: string;
    appVersion: string;
    host?: string;
    onMessageDispatch?: () => void;
    onDone?: () => void;
}) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
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
            type: IssueType.SOFTWARE_TECHNICAL,
            category: APP_BUG_CATEGORY,
            priority: 'Low',
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
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="help-screen">
            <Surface testID="help-contact">
                <XStack
                    padding={space[3]}
                    alignItems="center"
                    justifyContent="space-between"
                    gap={space[3]}
                    onPress={onMessageDispatch}
                    pressStyle={onMessageDispatch ? { opacity: 0.7 } : undefined}
                    testID="help-message-dispatch"
                >
                    <YStack flex={1} gap={2}>
                        <Body fontSize={15}>{t('help.messageDispatch')}</Body>
                        <Micro>{t('help.messageDispatchBody')}</Micro>
                    </YStack>
                    <Secondary fontSize={17}>{chevron()}</Secondary>
                </XStack>

                <Divider />

                <YStack padding={space[3]} gap={space[1]}>
                    <Body fontSize={15}>{t('help.faq')}</Body>
                    {/* Named as absent rather than left out, so nobody wonders
                        whether they missed it. */}
                    <Micro tone="warning">{t('help.faqUnavailable')}</Micro>
                </YStack>
            </Surface>

            <YStack gap={space[2]}>
                <Caption>{t('help.reportTitle')}</Caption>
                <Field
                    label={t('help.reportLabel')}
                    value={report}
                    onChangeText={setReport}
                    multiline
                    placeholder={t('help.reportPlaceholder')}
                    testID="help-report"
                />

                <Surface padded="compact" testID="help-diagnostics">
                    <YStack gap={space[1]}>
                        <Caption>{t('help.diagnostics')}</Caption>
                        <Micro tabular testID="help-diagnostics-summary">
                            {summary}
                        </Micro>
                    </YStack>
                </Surface>
                <Micro>{t('help.diagnosticsNote')}</Micro>

                {error ? (
                    <Banner tone="danger" message={t('help.reportFailed')} testID="help-error" />
                ) : queued ? (
                    <Banner tone="neutral" message={t('help.reportQueued')} testID="help-queued" />
                ) : sent ? (
                    <Banner tone="success" message={t('help.reportSent')} testID="help-sent" />
                ) : null}

                <XStack gap={space[2]}>
                    {onDone ? (
                        <Button flex={1} variant="ghost" onPress={onDone} testID="help-close">
                            {t('common.close')}
                        </Button>
                    ) : null}
                    <Button flex={1} disabled={!report.trim() || isSaving} loading={isSaving} onPress={submit} testID="help-send">
                        {t('help.send')}
                    </Button>
                </XStack>
            </YStack>
        </ScrollView>
    );
}

export default HelpScreen;
