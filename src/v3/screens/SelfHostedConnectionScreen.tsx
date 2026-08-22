/**
 * Connect to a self-hosted Fleetbase — R2 frame A4.
 *
 * **There is no API key field, and that is the point.** v2 asks the driver to
 * paste one, and its deep link ships one automatically — a single admin-scoped,
 * org-wide, unrevocable credential on every handset, which is the security hole
 * the audit opens with. None of that is needed: a Fleetbase host identifies
 * itself unauthenticated, so the app can confirm the URL is real, and how old
 * the instance is, before anyone types a password. The driver then signs in with
 * their *own* credentials.
 *
 * Plain http to a remote host is refused rather than warned about, since it
 * would put the driver's password on the wire in clear. Loopback and private
 * ranges are allowed, where it is normal.
 */
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { Surface } from '../ui/Surface';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { Banner, ErrorState } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { probeHost, type HostIdentity, type ProbeFailure } from '../connection/probeHost';
import { useScreenStyle } from '../ui/useScreenStyle';

const FAILURE_KEY: Record<ProbeFailure, string> = {
    'invalid-url': 'connect.invalidUrl',
    insecure: 'connect.insecure',
    unreachable: 'connect.unreachable',
    'not-fleetbase': 'connect.notFleetbase',
};

export function SelfHostedConnectionScreen({
    initialHost,
    onConnected,
    onCancel,
    /** Injected in tests. */
    probe = probeHost,
}: {
    initialHost?: string;
    onConnected?: (identity: HostIdentity) => void;
    onCancel?: () => void;
    probe?: typeof probeHost;
}) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    // Pre-auth screens render outside DriverShell, which is what supplies the
    // top inset everywhere else — without this the title sits under the notch.
    const insets = useSafeAreaInsets();
    const [host, setHost] = useState(initialHost ?? '');
    const [checking, setChecking] = useState(false);
    const [failure, setFailure] = useState<ProbeFailure | null>(null);
    const [identity, setIdentity] = useState<HostIdentity | null>(null);

    const check = useCallback(async () => {
        setChecking(true);
        setFailure(null);
        setIdentity(null);
        try {
            const result = await probe(host);
            if (result.ok) setIdentity(result.identity);
            else setFailure(result.reason);
        } finally {
            setChecking(false);
        }
    }, [host, probe]);

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], paddingTop: insets.top + space[4], gap: space[4] }}
            testID="self-hosted-connection"
        >
            <YStack gap={space[2]}>
                <Body fontSize={17} fontWeight="800">
                    {t('connect.title')}
                </Body>
                <Secondary fontSize={14}>{t('connect.intro')}</Secondary>
            </YStack>

            <Surface padded>
                <Field
                    label={t('connect.hostLabel')}
                    value={host}
                    onChangeText={(text) => {
                        setHost(text);
                        // A previous verdict says nothing about the new address.
                        setIdentity(null);
                        setFailure(null);
                    }}
                    placeholder="fleetbase.example.com"
                    keyboardType="default"
                    autoCapitalize="none"
                    hint={t('connect.hostHint')}
                    testID="input-host"
                />
            </Surface>

            {/* Says plainly that no key is wanted — v2 asked for one here. */}
            <Micro testID="no-key-needed">{t('connect.noKeyNeeded')}</Micro>

            {failure ? <ErrorState title={t('connect.checkFailed')} body={t(FAILURE_KEY[failure])} testID={`failure-${failure}`} /> : null}

            {identity ? (
                <Surface padded="compact" testID="connection-verified">
                    <YStack gap={space[2]}>
                        <XStack justifyContent="space-between" alignItems="center">
                            <Caption tone="success">{t('connect.verified')}</Caption>
                            {identity.version ? (
                                <Micro tabular testID="instance-version">
                                    {t('connect.version', { version: identity.version })}
                                </Micro>
                            ) : null}
                        </XStack>
                        <Identifier value={identity.host} boxed={false} />
                    </YStack>
                </Surface>
            ) : null}

            <XStack gap={space[2]}>
                <Button flex={1} variant="ghost" onPress={onCancel} testID="connect-cancel">
                    {t('common.cancel')}
                </Button>
                {identity ? (
                    <Button flex={2} onPress={() => onConnected?.(identity)} testID="connect-use">
                        {t('connect.use')}
                    </Button>
                ) : (
                    <Button flex={2} disabled={!host.trim()} loading={checking} onPress={check} testID="connect-check">
                        {t('connect.check')}
                    </Button>
                )}
            </XStack>

            <Banner tone="neutral" message={t('connect.signInNext')} testID="connect-next" />
        </ScrollView>
    );
}

export default SelfHostedConnectionScreen;
