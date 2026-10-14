/**
 * "Not enabled" — invariant 8 as a screen.
 *
 * A route whose backing does not exist on the driver API yet (documents), or
 * whose feature is still being taken over (inspections), used to render the
 * build-time placeholder: an English phase name and a blocker string aimed at
 * the person building the app, not the person driving. Before a road test that
 * reads as broken. This says, in the driver's language, what the thing is,
 * that their organisation has not enabled it, and who to ask — and nothing
 * that looks like data.
 */
import { YStack } from 'tamagui';
import { Body, Heading, Secondary } from '../ui/Text';
import { EmptyState } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';

export type NotEnabledFeature = 'documents' | 'inspection' | 'earnings';

export function NotEnabledScreen({ feature }: { feature: NotEnabledFeature }) {
    const { t } = useTranslation();
    return (
        <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[4]} justifyContent="center" testID={`not-enabled-${feature}`}>
            <YStack gap={space[1]}>
                <Heading fontSize={22}>{t(`notEnabled.${feature}.title`)}</Heading>
                <Secondary>{t(`notEnabled.${feature}.body`)}</Secondary>
            </YStack>
            <EmptyState title={t('notEnabled.title')} body={t('notEnabled.askDispatch')} testID="not-enabled-state" />
            <Body fontSize={13} tone="muted">
                {t(`notEnabled.${feature}.why`)}
            </Body>
        </YStack>
    );
}

export default NotEnabledScreen;
